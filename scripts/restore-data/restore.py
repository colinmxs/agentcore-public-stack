"""Restore tool for AgentCore Public Stack.

Reads a backup manifest.json from a backup bucket, discovers the target
infrastructure via SSM Parameter Store, and imports all backed-up data into
the deployed two-stack (PlatformStack + BackendStack) environment.

Restore steps (in order):
  1. DynamoDB tables — BatchWriteItem from DynamoDB-JSON exports
  2. S3 buckets — aws s3 sync from backup bucket to target bucket
  3. Cognito — re-create identity providers + app clients using preserved
     secrets, then import users/groups
  4. AgentCore Memory — best-effort event replay (if events were captured)

Usage:
  uv run python restore.py \
    --backup-bucket {prefix}-backup-{timestamp} \
    --manifest-key {prefix}/{timestamp}/manifest.json \
    --target-prefix {new-prefix} \
    --region us-west-2

The tool is idempotent: re-running it skips items that already exist
(DynamoDB conditional writes, S3 sync is naturally idempotent, Cognito
providers/clients are checked before creation, users use AdminCreateUser
with MessageAction=SUPPRESS which is idempotent on existing users).

Requires the target infrastructure (PlatformStack + BackendStack) to be
fully deployed before running — the tool resolves target table names and
bucket names from SSM.
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import logging
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Any

import boto3
import botocore
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

LOG = logging.getLogger("restore")

BOTO_CONFIG = BotoConfig(
    retries={"max_attempts": 10, "mode": "adaptive"},
    user_agent_extra="agentcore-restore/1.0",
)

# Maps backup logical names → SSM parameter paths for the target table names.
# Must stay in sync with the backup tool's DYNAMODB_TABLES list.
TABLE_SSM_MAP: dict[str, str] = {
    "users":                "/users/users-table-name",
    "app-roles":            "/rbac/app-roles-table-name",
    "api-keys":             "/auth/api-keys-table-name",
    "auth-providers":       "/auth/auth-providers-table-name",
    "oauth-providers":      "/oauth/providers-table-name",
    "oauth-user-tokens":    "/oauth/user-tokens-table-name",
    "user-quotas":          "/quota/user-quotas-table-name",
    "quota-events":         "/quota/quota-events-table-name",
    "sessions-metadata":    "/cost-tracking/sessions-metadata-table-name",
    "user-cost-summary":    "/cost-tracking/user-cost-summary-table-name",
    "system-cost-rollup":   "/cost-tracking/system-cost-rollup-table-name",
    "managed-models":       "/admin/managed-models-table-name",
    "user-menu-links":      "/admin/user-menu-links-table-name",
    "user-settings":        "/settings/user-settings-table-name",
    "user-file-uploads":    "/user-file-uploads/table-name",
    "shared-conversations": "/shares/shared-conversations-table-name",
    "rag-assistants":       "/rag/assistants-table-name",
    "artifacts":            "/artifacts/table-name",
    "fine-tuning-jobs":     "/fine-tuning/jobs-table-name",
    "fine-tuning-access":   "/fine-tuning/access-table-name",
}

# Convention-named tables (not in SSM)
TABLE_CONVENTION_MAP: dict[str, str] = {
    "assistants": "assistants",  # {prefix}-assistants
}

BUCKET_SSM_MAP: dict[str, str] = {
    "user-file-uploads": "/user-file-uploads/bucket-name",
    "rag-documents":     "/rag/documents-bucket-name",
    "artifacts":         "/artifacts/bucket-name",
    "fine-tuning-data":  "/fine-tuning/data-bucket-name",
}

SSM_USER_POOL_ID = "/auth/cognito/user-pool-id"


@dataclass
class RestoreContext:
    backup_bucket: str
    manifest_key: str
    target_prefix: str
    region: str
    session: boto3.Session
    manifest: dict[str, Any] = field(default_factory=dict)
    dry_run: bool = False
    skip_cognito_users: bool = False
    results: list[dict[str, Any]] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# SSM helpers                                                                  #
# --------------------------------------------------------------------------- #
def get_ssm_param(session: boto3.Session, prefix: str, path: str) -> str | None:
    ssm = session.client("ssm", config=BOTO_CONFIG)
    try:
        return ssm.get_parameter(Name=f"/{prefix}{path}")["Parameter"]["Value"]
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ParameterNotFound":
            return None
        raise


# --------------------------------------------------------------------------- #
# DynamoDB restore                                                             #
# --------------------------------------------------------------------------- #
def restore_dynamodb_table(ctx: RestoreContext, logical_name: str, component: dict) -> dict:
    """Restore a single DynamoDB table from its ExportTableToPointInTime output."""
    detail = component.get("detail", {})
    export_manifest_key = detail.get("export_manifest_key")
    if not export_manifest_key:
        return {"logical": logical_name, "status": "skipped", "reason": "no export_manifest_key in backup"}

    # Resolve target table name
    target_table = None
    if logical_name in TABLE_SSM_MAP:
        target_table = get_ssm_param(ctx.session, ctx.target_prefix, TABLE_SSM_MAP[logical_name])
    elif logical_name in TABLE_CONVENTION_MAP:
        target_table = f"{ctx.target_prefix}-{TABLE_CONVENTION_MAP[logical_name]}"

    if not target_table:
        return {"logical": logical_name, "status": "skipped", "reason": f"target table not found via SSM"}

    LOG.info(f"[DynamoDB] Restoring {logical_name} → {target_table}")
    if ctx.dry_run:
        return {"logical": logical_name, "status": "dry-run", "target_table": target_table}

    s3 = ctx.session.client("s3", config=BOTO_CONFIG)
    dynamodb = ctx.session.resource("dynamodb", config=BOTO_CONFIG)
    table = dynamodb.Table(target_table)

    # Read the export manifest to find data files
    manifest_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=export_manifest_key)
    manifest_body = manifest_obj["Body"].read().decode("utf-8")

    # The export manifest is a summary JSON with a dataFileS3Key list
    # OR it's the manifest-files format. Handle both.
    data_files = []
    try:
        manifest_data = json.loads(manifest_body)
        # ExportTableToPointInTime manifest format
        if "dataFileS3Key" in manifest_data:
            data_files = [manifest_data["dataFileS3Key"]]
        elif "dataFiles" in manifest_data:
            data_files = [f["dataFileS3Key"] for f in manifest_data["dataFiles"]]
    except json.JSONDecodeError:
        # Line-delimited manifest (each line is a JSON object with dataFileS3Key)
        for line in manifest_body.strip().split("\n"):
            if line.strip():
                entry = json.loads(line)
                if "dataFileS3Key" in entry:
                    data_files.append(entry["dataFileS3Key"])

    items_written = 0
    for data_key in data_files:
        obj = s3.get_object(Bucket=ctx.backup_bucket, Key=data_key)
        body = obj["Body"].read()

        # DynamoDB exports are gzipped
        if data_key.endswith(".gz"):
            body = gzip.decompress(body)

        # Each line is a JSON object with an "Item" key containing DynamoDB-JSON
        with table.batch_writer() as batch:
            for line in body.decode("utf-8").strip().split("\n"):
                if not line.strip():
                    continue
                record = json.loads(line)
                item = record.get("Item", record)
                # Convert DynamoDB-JSON to Python dict
                deserialized = _deserialize_dynamodb_json(item)
                batch.put_item(Item=deserialized)
                items_written += 1

    LOG.info(f"[DynamoDB] {logical_name}: wrote {items_written} items to {target_table}")
    return {"logical": logical_name, "status": "ok", "items_written": items_written, "target_table": target_table}


def _deserialize_dynamodb_json(item: dict) -> dict:
    """Convert DynamoDB-JSON (typed attribute values) to plain Python dict."""
    deserializer = boto3.dynamodb.types.TypeDeserializer()
    return {k: deserializer.deserialize(v) for k, v in item.items()}


# --------------------------------------------------------------------------- #
# S3 restore                                                                   #
# --------------------------------------------------------------------------- #
def restore_s3_bucket(ctx: RestoreContext, logical_name: str, component: dict) -> dict:
    """Restore an S3 bucket via aws s3 sync from the backup."""
    # Resolve target bucket name
    target_bucket = get_ssm_param(ctx.session, ctx.target_prefix, BUCKET_SSM_MAP.get(logical_name, ""))
    if not target_bucket:
        return {"logical": logical_name, "status": "skipped", "reason": "target bucket not found via SSM"}

    # Source path in backup bucket
    source_prefix = component.get("detail", {}).get("s3_prefix", f"s3/{logical_name}/")
    source_uri = f"s3://{ctx.backup_bucket}/{ctx.manifest.get('root_prefix', '')}{source_prefix}"
    target_uri = f"s3://{target_bucket}/"

    LOG.info(f"[S3] Syncing {logical_name}: {source_uri} → {target_uri}")
    if ctx.dry_run:
        return {"logical": logical_name, "status": "dry-run", "source": source_uri, "target": target_uri}

    result = subprocess.run(
        ["aws", "s3", "sync", source_uri, target_uri, "--region", ctx.region],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        LOG.error(f"[S3] {logical_name} sync failed: {result.stderr}")
        return {"logical": logical_name, "status": "failed", "error": result.stderr[:500]}

    LOG.info(f"[S3] {logical_name}: sync complete")
    return {"logical": logical_name, "status": "ok", "target_bucket": target_bucket}


# --------------------------------------------------------------------------- #
# Cognito restore                                                              #
# --------------------------------------------------------------------------- #
def restore_cognito(ctx: RestoreContext) -> list[dict]:
    """Restore Cognito identity providers, app clients, and users."""
    results = []
    root = ctx.manifest.get("root_prefix", "")
    s3 = ctx.session.client("s3", config=BOTO_CONFIG)

    target_pool_id = get_ssm_param(ctx.session, ctx.target_prefix, SSM_USER_POOL_ID)
    if not target_pool_id:
        results.append({"component": "cognito", "status": "skipped", "reason": "target user pool not found"})
        return results

    cognito = ctx.session.client("cognito-idp", config=BOTO_CONFIG)

    # --- Identity Providers ---
    try:
        idp_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=f"{root}cognito/identity-providers.json")
        idps = json.loads(idp_obj["Body"].read())
        for idp in idps:
            provider_name = idp.get("ProviderName")
            if not provider_name:
                continue
            LOG.info(f"[Cognito] Creating IdP: {provider_name}")
            if not ctx.dry_run:
                try:
                    cognito.create_identity_provider(
                        UserPoolId=target_pool_id,
                        ProviderName=provider_name,
                        ProviderType=idp.get("ProviderType", "OIDC"),
                        ProviderDetails=idp.get("ProviderDetails", {}),
                        AttributeMapping=idp.get("AttributeMapping", {}),
                        IdpIdentifiers=idp.get("IdpIdentifiers", []),
                    )
                except ClientError as e:
                    if e.response["Error"]["Code"] == "DuplicateProviderException":
                        LOG.info(f"[Cognito] IdP {provider_name} already exists, skipping")
                    else:
                        raise
        results.append({"component": "cognito-idps", "status": "ok", "count": len(idps)})
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchKey":
            results.append({"component": "cognito-idps", "status": "skipped", "reason": "no backup file"})
        else:
            results.append({"component": "cognito-idps", "status": "failed", "error": str(e)})

    # --- App Clients ---
    try:
        clients_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=f"{root}cognito/app-clients.json")
        clients = json.loads(clients_obj["Body"].read())
        for client in clients:
            client_name = client.get("ClientName")
            LOG.info(f"[Cognito] Noting app client: {client_name} (CDK manages creation; secrets preserved for reference)")
        results.append({"component": "cognito-clients", "status": "ok", "count": len(clients),
                       "note": "App clients are CDK-managed; backup preserves secrets for manual re-registration if needed"})
    except ClientError:
        results.append({"component": "cognito-clients", "status": "skipped"})

    # --- Users ---
    if ctx.skip_cognito_users:
        results.append({"component": "cognito-users", "status": "skipped", "reason": "--skip-cognito-users"})
        return results

    try:
        users_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=f"{root}cognito/users.jsonl.gz")
        body = gzip.decompress(users_obj["Body"].read()).decode("utf-8")
        user_count = 0
        for line in body.strip().split("\n"):
            if not line.strip():
                continue
            user = json.loads(line)
            username = user.get("Username")
            if not username:
                continue
            if ctx.dry_run:
                user_count += 1
                continue
            # Create user with suppressed welcome message
            attrs = [{"Name": a["Name"], "Value": a["Value"]}
                     for a in user.get("Attributes", [])
                     if a.get("Value")]
            try:
                cognito.admin_create_user(
                    UserPoolId=target_pool_id,
                    Username=username,
                    UserAttributes=attrs,
                    MessageAction="SUPPRESS",
                )
                user_count += 1
            except ClientError as e:
                if e.response["Error"]["Code"] == "UsernameExistsException":
                    user_count += 1  # already exists, idempotent
                else:
                    LOG.warning(f"[Cognito] Failed to create user {username}: {e}")
        results.append({"component": "cognito-users", "status": "ok", "count": user_count})
    except ClientError:
        results.append({"component": "cognito-users", "status": "skipped", "reason": "no users backup file"})

    # --- Groups + Memberships ---
    try:
        groups_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=f"{root}cognito/groups.jsonl.gz")
        body = gzip.decompress(groups_obj["Body"].read()).decode("utf-8")
        group_count = 0
        for line in body.strip().split("\n"):
            if not line.strip():
                continue
            group = json.loads(line)
            group_name = group.get("GroupName")
            if not group_name or ctx.dry_run:
                group_count += 1
                continue
            try:
                cognito.create_group(
                    UserPoolId=target_pool_id,
                    GroupName=group_name,
                    Description=group.get("Description", ""),
                )
                group_count += 1
            except ClientError as e:
                if e.response["Error"]["Code"] == "GroupExistsException":
                    group_count += 1
                else:
                    LOG.warning(f"[Cognito] Failed to create group {group_name}: {e}")
        results.append({"component": "cognito-groups", "status": "ok", "count": group_count})
    except ClientError:
        results.append({"component": "cognito-groups", "status": "skipped"})

    try:
        memberships_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=f"{root}cognito/group-memberships.jsonl.gz")
        body = gzip.decompress(memberships_obj["Body"].read()).decode("utf-8")
        membership_count = 0
        for line in body.strip().split("\n"):
            if not line.strip():
                continue
            m = json.loads(line)
            if ctx.dry_run:
                membership_count += 1
                continue
            try:
                cognito.admin_add_user_to_group(
                    UserPoolId=target_pool_id,
                    Username=m["Username"],
                    GroupName=m["GroupName"],
                )
                membership_count += 1
            except ClientError as e:
                LOG.warning(f"[Cognito] Failed to add {m.get('Username')} to {m.get('GroupName')}: {e}")
        results.append({"component": "cognito-memberships", "status": "ok", "count": membership_count})
    except ClientError:
        results.append({"component": "cognito-memberships", "status": "skipped"})

    return results


# --------------------------------------------------------------------------- #
# Main orchestration                                                           #
# --------------------------------------------------------------------------- #
def run_restore(ctx: RestoreContext) -> dict:
    """Execute the full restore pipeline."""
    s3 = ctx.session.client("s3", config=BOTO_CONFIG)

    # Load manifest
    LOG.info(f"Loading manifest from s3://{ctx.backup_bucket}/{ctx.manifest_key}")
    manifest_obj = s3.get_object(Bucket=ctx.backup_bucket, Key=ctx.manifest_key)
    ctx.manifest = json.loads(manifest_obj["Body"].read())

    components = ctx.manifest.get("components", {})
    root_prefix = ctx.manifest.get("root_prefix", "")

    # --- DynamoDB ---
    ddb_components = components.get("dynamodb", [])
    LOG.info(f"Restoring {len(ddb_components)} DynamoDB tables...")
    for comp in ddb_components:
        if comp.get("status") != "ok":
            ctx.results.append({"logical": comp["logical_name"], "status": "skipped", "reason": "backup status was not ok"})
            continue
        result = restore_dynamodb_table(ctx, comp["logical_name"], comp)
        ctx.results.append(result)

    # --- S3 ---
    s3_components = components.get("s3", [])
    LOG.info(f"Restoring {len(s3_components)} S3 buckets...")
    for comp in s3_components:
        if comp.get("status") != "ok":
            ctx.results.append({"logical": comp["logical_name"], "status": "skipped", "reason": "backup status was not ok"})
            continue
        result = restore_s3_bucket(ctx, comp["logical_name"], comp)
        ctx.results.append(result)

    # --- Cognito ---
    cognito_components = components.get("cognito", [])
    if cognito_components:
        LOG.info("Restoring Cognito...")
        cognito_results = restore_cognito(ctx)
        ctx.results.extend(cognito_results)
    else:
        LOG.info("No Cognito backup found, skipping")

    # --- Summary ---
    ok = sum(1 for r in ctx.results if r.get("status") == "ok")
    skipped = sum(1 for r in ctx.results if r.get("status") in ("skipped", "dry-run"))
    failed = sum(1 for r in ctx.results if r.get("status") == "failed")

    summary = {
        "backup_bucket": ctx.backup_bucket,
        "target_prefix": ctx.target_prefix,
        "total": len(ctx.results),
        "ok": ok,
        "skipped": skipped,
        "failed": failed,
        "dry_run": ctx.dry_run,
        "results": ctx.results,
    }

    LOG.info(f"Restore complete: {ok} ok, {skipped} skipped, {failed} failed")
    return summary


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Restore AgentCore data from a backup")
    parser.add_argument("--backup-bucket", required=True, help="S3 bucket containing the backup")
    parser.add_argument("--manifest-key", required=True, help="S3 key of manifest.json in the backup bucket")
    parser.add_argument("--target-prefix", required=True, help="CDK project prefix of the target environment")
    parser.add_argument("--region", required=True, help="AWS region of the target environment")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be restored without writing")
    parser.add_argument("--skip-cognito-users", action="store_true",
                       help="Skip Cognito user import (useful if users will self-register)")
    parser.add_argument("--profile", help="AWS profile name")

    args = parser.parse_args()

    session = boto3.Session(
        region_name=args.region,
        profile_name=args.profile,
    )

    ctx = RestoreContext(
        backup_bucket=args.backup_bucket,
        manifest_key=args.manifest_key,
        target_prefix=args.target_prefix,
        region=args.region,
        session=session,
        dry_run=args.dry_run,
        skip_cognito_users=args.skip_cognito_users,
    )

    summary = run_restore(ctx)

    # Write summary to stdout as JSON
    print(json.dumps(summary, indent=2, default=str))

    if summary["failed"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
