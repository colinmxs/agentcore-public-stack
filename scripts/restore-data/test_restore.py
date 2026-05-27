"""Tests for restore.py — focused on the four bugs found by the
first live-fire dry-run against the May 21 backup manifest.

These tests don't hit AWS. They use unittest.mock to stub the
small S3/SSM call surface and assert the restore tool reads the
right manifest fields and constructs the right paths.
"""

from __future__ import annotations

import gzip
import io
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add the script directory to sys.path so we can import the module
# under test directly. The script is meant to be run as a CLI; it
# doesn't have a setup.py.
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import restore  # noqa: E402


def _make_ctx(
    manifest: dict,
    *,
    backup_bucket: str = "test-backup-bucket",
    target_prefix: str = "test-prefix",
    region: str = "us-west-2",
    dry_run: bool = False,
) -> restore.RestoreContext:
    """Construct a RestoreContext suitable for unit tests."""
    session = MagicMock()
    return restore.RestoreContext(
        backup_bucket=backup_bucket,
        manifest_key="manifest.json",
        target_prefix=target_prefix,
        region=region,
        session=session,
        manifest=manifest,
        dry_run=dry_run,
    )


# --------------------------------------------------------------------- #
# Bug 1 + 2: backup writes detail.export_manifest (a path to            #
# manifest-summary.json), not detail.export_manifest_key. Restore must  #
# read that field and indirect through manifestFilesS3Key →             #
# manifest-files.json (line-delimited dataFileS3Keys) to find the       #
# actual data files.                                                    #
# --------------------------------------------------------------------- #
def test_dynamodb_restore_reads_export_manifest_field():
    """When the backup component lacks export_manifest entirely,
    restore should skip with a precise reason."""
    ctx = _make_ctx({"root_prefix": "root", "components": {}})
    component = {
        "logical_name": "users",
        "status": "ok",
        "detail": {},  # no export_manifest field at all
    }
    result = restore.restore_dynamodb_table(ctx, "users", component)
    assert result["status"] == "skipped"
    assert "export_manifest" in result["reason"]
    # Crucially, NOT the obsolete "export_manifest_key" string.
    assert "export_manifest_key" not in result["reason"]


def test_dynamodb_restore_indirects_through_manifest_files():
    """Restore should read manifest-summary.json, follow
    manifestFilesS3Key, then read manifest-files.json (line-delimited)
    to find dataFileS3Key entries."""
    summary_payload = json.dumps({
        "version": "2020-06-30",
        "exportArn": "arn:aws:dynamodb:...:export/abc",
        "manifestFilesS3Key": "root/dynamodb/users/AWSDynamoDB/abc/manifest-files.json",
        "outputFormat": "DYNAMODB_JSON",
    })
    files_payload = (
        '{"itemCount": 1, "dataFileS3Key": "root/dynamodb/users/AWSDynamoDB/abc/data/file1.json.gz"}\n'
        '{"itemCount": 1, "dataFileS3Key": "root/dynamodb/users/AWSDynamoDB/abc/data/file2.json.gz"}\n'
    )
    # Each data file is gzipped line-delimited DynamoDB-JSON.
    data_payload_1 = json.dumps({"Item": {"PK": {"S": "USER#1"}, "name": {"S": "Alice"}}}).encode()
    data_payload_2 = json.dumps({"Item": {"PK": {"S": "USER#2"}, "name": {"S": "Bob"}}}).encode()
    gzipped_1 = gzip.compress(data_payload_1)
    gzipped_2 = gzip.compress(data_payload_2)

    s3_responses = {
        "root/dynamodb/users/AWSDynamoDB/abc/manifest-summary.json":
            {"Body": io.BytesIO(summary_payload.encode())},
        "root/dynamodb/users/AWSDynamoDB/abc/manifest-files.json":
            {"Body": io.BytesIO(files_payload.encode())},
        "root/dynamodb/users/AWSDynamoDB/abc/data/file1.json.gz":
            {"Body": io.BytesIO(gzipped_1)},
        "root/dynamodb/users/AWSDynamoDB/abc/data/file2.json.gz":
            {"Body": io.BytesIO(gzipped_2)},
    }

    s3 = MagicMock()
    s3.get_object.side_effect = lambda Bucket, Key: s3_responses[Key]

    table = MagicMock()
    batch_writer = MagicMock()
    batch_writer.__enter__ = MagicMock(return_value=batch_writer)
    batch_writer.__exit__ = MagicMock(return_value=False)
    table.batch_writer.return_value = batch_writer

    dynamodb = MagicMock()
    dynamodb.Table.return_value = table

    ctx = _make_ctx({"root_prefix": "root"})
    ctx.session.client.return_value = s3
    ctx.session.resource.return_value = dynamodb

    component = {
        "logical_name": "users",
        "status": "ok",
        "detail": {
            "table_name": "test-prefix-users",
            # Backup writes this AWS-returned field name.
            "export_manifest": "root/dynamodb/users/AWSDynamoDB/abc/manifest-summary.json",
        },
    }

    with patch.object(restore, "get_ssm_param", return_value="test-prefix-users"):
        result = restore.restore_dynamodb_table(ctx, "users", component)

    assert result["status"] == "ok", result
    assert result["items_written"] == 2
    # Should have called BatchWriter.put_item twice with deserialized dicts.
    put_calls = batch_writer.put_item.call_args_list
    assert len(put_calls) == 2
    written_pks = {c.kwargs["Item"]["PK"] for c in put_calls}
    assert written_pks == {"USER#1", "USER#2"}


# --------------------------------------------------------------------- #
# Bug 3: root_prefix concat used to drop the '/' separator. The         #
# manifest stores root_prefix as 'project/timestamp' (no trailing       #
# slash); the previous restore code did f"{root}{path}" and produced    #
# 'project/timestampcognito/users.jsonl.gz'. Verify that both the       #
# cognito and S3 sync code paths now construct the right keys.          #
# --------------------------------------------------------------------- #
def test_s3_restore_path_includes_separator():
    ctx = _make_ctx(
        {
            "root_prefix": "ai-sbmt-api/20260521T181146Z",  # no trailing slash
        },
        dry_run=True,
    )
    component = {
        "logical_name": "rag-documents",
        "status": "ok",
        "detail": {},  # no s3_prefix → falls back to f"s3/{logical}/"
    }

    with patch.object(restore, "get_ssm_param", return_value="ai-sbmt-api-rag-documents-12345"):
        result = restore.restore_s3_bucket(ctx, "rag-documents", component)

    assert result["status"] == "dry-run"
    # The bug produced "...20260521T181146Zs3/rag-documents/" with no slash.
    assert "20260521T181146Z/s3/rag-documents/" in result["source"], result["source"]
    assert "20260521T181146Zs3/rag-documents/" not in result["source"], result["source"]


def test_s3_restore_path_handles_root_prefix_with_trailing_slash():
    """If a future backup adds a trailing slash, restore shouldn't
    double it up."""
    ctx = _make_ctx(
        {"root_prefix": "ai-sbmt-api/20260521T181146Z/"},  # trailing slash
        dry_run=True,
    )
    component = {"logical_name": "rag-documents", "status": "ok", "detail": {}}

    with patch.object(restore, "get_ssm_param", return_value="dest"):
        result = restore.restore_s3_bucket(ctx, "rag-documents", component)

    assert "20260521T181146Z/s3/rag-documents/" in result["source"]
    assert "20260521T181146Z//s3/rag-documents/" not in result["source"]


# --------------------------------------------------------------------- #
# Bug 4: the `assistants` table was decommissioned in commit c977e04e   #
# (deletion of AssistantsTableConstruct). Restoring from an old backup  #
# should not attempt to write into a table that no longer exists.       #
# --------------------------------------------------------------------- #
def test_assistants_table_removed_from_convention_map():
    """The decommissioned `assistants` table was the only entry in
    TABLE_CONVENTION_MAP. The map should now be empty so an old
    backup's assistants component skips cleanly."""
    assert "assistants" not in restore.TABLE_CONVENTION_MAP
    assert restore.TABLE_CONVENTION_MAP == {}


def test_decommissioned_assistants_component_skips_with_clear_reason():
    ctx = _make_ctx({"root_prefix": "root"})
    component = {
        "logical_name": "assistants",
        "status": "ok",
        "detail": {
            "export_manifest": "root/dynamodb/assistants/AWSDynamoDB/x/manifest-summary.json",
        },
    }
    # No SSM lookup match either — assistants is not in TABLE_SSM_MAP
    with patch.object(restore, "get_ssm_param", return_value=None):
        result = restore.restore_dynamodb_table(ctx, "assistants", component)
    assert result["status"] == "skipped"
    assert "target table not found" in result["reason"]


# --------------------------------------------------------------------- #
# Bug 6: cognito identity-providers.json + app-clients.json are wrapped #
# objects ({"providers": [...]} and {"clients": [...]}), not bare       #
# arrays. Iterating the dict directly yielded keys (strings), then     #
# `idp.get(...)` raised AttributeError. Verify both wrappers are       #
# unwrapped correctly, plus the bare-array fallback for hand-edited    #
# backups.                                                              #
# --------------------------------------------------------------------- #
def test_cognito_identity_providers_unwraps_providers_key():
    """The backup writes {'providers': [...]} — restore must read that
    list, not iterate the dict's keys."""
    idp_payload = json.dumps({
        "providers": [
            {
                "ProviderName": "AzureAD",
                "ProviderType": "OIDC",
                "ProviderDetails": {"client_id": "abc"},
                "AttributeMapping": {"email": "email"},
                "IdpIdentifiers": [],
            },
        ],
    })
    s3 = MagicMock()

    def get_object_side_effect(*, Bucket, Key):
        if Key.endswith("identity-providers.json"):
            return {"Body": io.BytesIO(idp_payload.encode())}
        from botocore.exceptions import ClientError as _ClientError
        raise _ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
    s3.get_object.side_effect = get_object_side_effect

    cognito = MagicMock()
    cognito.create_identity_provider = MagicMock()

    def client_factory(name, *_a, **_kw):
        return s3 if name == "s3" else cognito

    ctx = _make_ctx({"root_prefix": "root"}, dry_run=False)
    ctx.session.client.side_effect = client_factory

    with patch.object(restore, "get_ssm_param", return_value="us-west-2_test"):
        results = restore.restore_cognito(ctx)

    idp_result = next(r for r in results if r.get("component") == "cognito-idps")
    assert idp_result["status"] == "ok", idp_result
    assert idp_result["count"] == 1
    cognito.create_identity_provider.assert_called_once()
    call_kwargs = cognito.create_identity_provider.call_args.kwargs
    assert call_kwargs["ProviderName"] == "AzureAD"
    assert call_kwargs["ProviderType"] == "OIDC"


def test_cognito_app_clients_unwraps_clients_key():
    """Same wrapper as IdPs, but for app-clients.json."""
    clients_payload = json.dumps({
        "clients": [
            {"ClientName": "WebClient", "ClientId": "abc123"},
        ],
    })
    s3 = MagicMock()

    # Two get_object calls happen during restore_cognito: identity-providers
    # then app-clients. Make IdPs raise NoSuchKey (legitimate: no IdP backup
    # in this fixture) so we exercise the clients path.
    def get_object_side_effect(*, Bucket, Key):
        if Key.endswith("identity-providers.json"):
            from botocore.exceptions import ClientError as _ClientError
            raise _ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        if Key.endswith("app-clients.json"):
            return {"Body": io.BytesIO(clients_payload.encode())}
        # Anything else (users, groups, memberships) — also NoSuchKey
        from botocore.exceptions import ClientError as _ClientError
        raise _ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
    s3.get_object.side_effect = get_object_side_effect

    cognito = MagicMock()

    def client_factory(name, *_a, **_kw):
        return s3 if name == "s3" else cognito

    ctx = _make_ctx({"root_prefix": "root"}, dry_run=False)
    ctx.session.client.side_effect = client_factory

    with patch.object(restore, "get_ssm_param", return_value="us-west-2_test"):
        results = restore.restore_cognito(ctx)

    clients_result = next(r for r in results if r.get("component") == "cognito-clients")
    assert clients_result["status"] == "ok"
    assert clients_result["count"] == 1


def test_cognito_identity_providers_falls_back_to_bare_array():
    """If a hand-edited or alternate backup writes a bare array,
    handle that too (defensive — backup always writes wrapped today)."""
    idp_payload = json.dumps([
        {"ProviderName": "BareArrayIdP", "ProviderType": "OIDC"},
    ])
    s3 = MagicMock()

    def get_object_side_effect(*, Bucket, Key):
        if Key.endswith("identity-providers.json"):
            return {"Body": io.BytesIO(idp_payload.encode())}
        from botocore.exceptions import ClientError as _ClientError
        raise _ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
    s3.get_object.side_effect = get_object_side_effect

    cognito = MagicMock()
    cognito.create_identity_provider = MagicMock()

    def client_factory(name, *_a, **_kw):
        return s3 if name == "s3" else cognito

    ctx = _make_ctx({"root_prefix": "root"}, dry_run=False)
    ctx.session.client.side_effect = client_factory

    with patch.object(restore, "get_ssm_param", return_value="us-west-2_test"):
        results = restore.restore_cognito(ctx)

    idp_result = next(r for r in results if r.get("component") == "cognito-idps")
    assert idp_result["status"] == "ok"
    assert idp_result["count"] == 1
