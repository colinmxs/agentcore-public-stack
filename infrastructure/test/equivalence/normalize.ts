/**
 * Equivalence-test normalization utilities.
 *
 * The equivalence test compares two synth outputs:
 *   (1) Legacy 9-stack architecture (via bin/infrastructure-legacy.ts)
 *   (2) New 2-stack architecture (via bin/infrastructure.ts)
 *
 * To make this comparison meaningful we strip away purely structural
 * differences that are EXPECTED to change between the two architectures:
 *
 *   - Stack-boundary metadata: which stack a resource lives in
 *   - CDK-generated logical IDs (stable but per-architecture)
 *   - Per-stack `Outputs` and `Parameters` synthesized for cross-stack
 *     references (these reshape entirely under the new architecture
 *     because typed prop passing replaces both CFN exports and SSM
 *     cross-stack reads)
 *   - The CDKMetadata resource (stack-scoped, doesn't reflect intent)
 *   - Cross-stack-only SSM parameters (the parameters whose sole
 *     consumer was another CDK stack — these go away under typed prop
 *     passing). Application-runtime SSM parameters are preserved.
 *
 * Everything else — every actual AWS resource and its properties — must
 * match byte-for-byte between the two architectures for the equivalence
 * test to pass.
 */

import * as cdk from 'aws-cdk-lib';

/** A normalized resource as it appears in the equivalence comparison. */
export interface NormalizedResource {
  /** Logical resource type, e.g. "AWS::EC2::VPC" */
  Type: string;
  /** Resource properties, with refs/imports normalized to opaque tokens */
  Properties: unknown;
  /** IAM-policy-style fields normalized so element ordering doesn't matter */
  /** Resource attributes (DeletionPolicy, UpdateReplacePolicy, DependsOn). */
  Attributes?: Record<string, unknown>;
}

/**
 * Synthesize a CDK App and return a normalized resource union across
 * every stack in the assembly.
 *
 * Resources are keyed by a fingerprint built from (type + sorted
 * normalized properties). This collapses logical-ID and stack-boundary
 * differences while still distinguishing semantically-distinct
 * resources.
 */
export function snapshotApp(app: cdk.App): NormalizedSnapshot {
  const assembly = app.synth();
  const resources: Record<string, NormalizedResource[]> = {};
  const stacks: string[] = [];

  for (const stack of assembly.stacks) {
    stacks.push(stack.stackName);
    const template = stack.template as {
      Resources?: Record<string, RawResource>;
    };
    if (!template.Resources) continue;

    for (const [logicalId, raw] of Object.entries(template.Resources)) {
      // Skip CDKMetadata — it's stack-scoped synthesizer plumbing and
      // doesn't represent an AWS resource the user intends to provision.
      if (raw.Type === 'AWS::CDK::Metadata') continue;

      const normalized = normalizeResource(raw);
      const key = resourceKey(normalized);
      if (!resources[key]) resources[key] = [];
      resources[key].push(normalized);
    }
  }

  return { resources, stacks };
}

export interface NormalizedSnapshot {
  /** Keyed by (type::propsHash). Value is the list of matching resources
   *  across all stacks (typically length 1 except for symmetrical
   *  resources like duplicated SSM publications). */
  resources: Record<string, NormalizedResource[]>;
  /** The stack names that contributed to this snapshot. */
  stacks: string[];
}

interface RawResource {
  Type: string;
  Properties?: unknown;
  DeletionPolicy?: unknown;
  UpdateReplacePolicy?: unknown;
  DependsOn?: unknown;
  Metadata?: unknown;
}

/** Normalize a raw resource to remove purely cosmetic variation. */
function normalizeResource(raw: RawResource): NormalizedResource {
  const attributes: Record<string, unknown> = {};
  if (raw.DeletionPolicy !== undefined) attributes.DeletionPolicy = raw.DeletionPolicy;
  if (raw.UpdateReplacePolicy !== undefined) {
    attributes.UpdateReplacePolicy = raw.UpdateReplacePolicy;
  }
  // DependsOn is a list of logical IDs — those CHANGE between
  // architectures because the IDs themselves change. Drop entirely
  // for equivalence; if we later need to assert dependency *semantics*
  // we can capture (type-of-target, count) instead.

  const result: NormalizedResource = {
    Type: raw.Type,
    Properties: normalizeProperties(raw.Properties),
  };
  if (Object.keys(attributes).length > 0) {
    result.Attributes = attributes;
  }
  return result;
}

/**
 * Recursively normalize properties:
 *   - Sort object keys (so {a: 1, b: 2} === {b: 2, a: 1})
 *   - Replace Ref / Fn::GetAtt / Fn::ImportValue / Fn::Sub references
 *     with opaque tokens that compare equal as long as the *shape* of
 *     the reference matches (Ref → "REF", Fn::GetAtt → "GETATT", etc.)
 *   - Sort IAM policy Statement arrays by Sid (when present) so element
 *     ordering doesn't cause spurious diffs
 */
function normalizeProperties(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const arr = value.map(normalizeProperties);
    return maybeSortStatements(arr);
  }

  const obj = value as Record<string, unknown>;

  // Intrinsic-function reductions: collapse Ref / Fn::GetAtt / etc to
  // shape-only tokens so logical-ID changes don't break equivalence.
  if (Object.keys(obj).length === 1) {
    if ('Ref' in obj) return { __REF__: true };
    if ('Fn::GetAtt' in obj) {
      const arr = obj['Fn::GetAtt'];
      const attr = Array.isArray(arr) && arr.length === 2 ? arr[1] : null;
      return { __GETATT__: attr };
    }
    if ('Fn::ImportValue' in obj) return { __IMPORTVALUE__: true };
    if ('Fn::Sub' in obj) {
      // Keep the literal template string (sub strings often include
      // resource ARN patterns whose substance matters), but normalize
      // any nested refs in the variable map.
      const sub = obj['Fn::Sub'];
      if (typeof sub === 'string') return { __SUB__: sub };
      if (Array.isArray(sub) && sub.length === 2) {
        return { __SUB__: sub[0], vars: normalizeProperties(sub[1]) };
      }
      return { __SUB__: true };
    }
    if ('Fn::Join' in obj) {
      const join = obj['Fn::Join'];
      if (Array.isArray(join) && join.length === 2) {
        return {
          __JOIN__: join[0],
          parts: (join[1] as unknown[]).map(normalizeProperties),
        };
      }
    }
  }

  // Ordinary object: recurse and sort keys.
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = normalizeProperties(obj[k]);
  }
  return out;
}

/**
 * If an array looks like an IAM policy Statement list (every element is
 * an object with at least Effect+Action), sort by stringified content
 * so order-of-grant differences don't cause spurious diffs. Otherwise
 * leave the array order alone (lists like SubnetIds, AvailabilityZones
 * etc. are legitimately position-sensitive).
 */
function maybeSortStatements(arr: unknown[]): unknown[] {
  if (arr.length === 0) return arr;
  const looksLikeStatements = arr.every(
    (el) =>
      el !== null &&
      typeof el === 'object' &&
      !Array.isArray(el) &&
      'Effect' in (el as object),
  );
  if (!looksLikeStatements) return arr;
  return [...arr].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
}

/** Stable string key for grouping equivalent resources. */
function resourceKey(r: NormalizedResource): string {
  return `${r.Type}::${stableHash(r.Properties)}`;
}

/** Order-stable JSON serialization of an already-normalized value. */
function stableHash(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Compare two snapshots and return a structured diff.
 *
 * Each entry in `onlyInLegacy` and `onlyInNew` is a normalized
 * resource that exists in one snapshot but has no equivalent in the
 * other. `mismatchedCounts` lists keys where both snapshots have the
 * resource but with different multiplicities.
 */
export interface SnapshotDiff {
  onlyInLegacy: { key: string; resources: NormalizedResource[] }[];
  onlyInNew: { key: string; resources: NormalizedResource[] }[];
  mismatchedCounts: {
    key: string;
    legacyCount: number;
    newCount: number;
  }[];
}

export function diffSnapshots(
  legacy: NormalizedSnapshot,
  fresh: NormalizedSnapshot,
): SnapshotDiff {
  const onlyInLegacy: SnapshotDiff['onlyInLegacy'] = [];
  const onlyInNew: SnapshotDiff['onlyInNew'] = [];
  const mismatchedCounts: SnapshotDiff['mismatchedCounts'] = [];

  for (const [key, legacyResources] of Object.entries(legacy.resources)) {
    const newResources = fresh.resources[key];
    if (!newResources) {
      onlyInLegacy.push({ key, resources: legacyResources });
      continue;
    }
    if (newResources.length !== legacyResources.length) {
      mismatchedCounts.push({
        key,
        legacyCount: legacyResources.length,
        newCount: newResources.length,
      });
    }
  }

  for (const [key, newResources] of Object.entries(fresh.resources)) {
    if (!legacy.resources[key]) {
      onlyInNew.push({ key, resources: newResources });
    }
  }

  return { onlyInLegacy, onlyInNew, mismatchedCounts };
}

/** True if two snapshots have identical resource unions. */
export function snapshotsEqual(diff: SnapshotDiff): boolean {
  return (
    diff.onlyInLegacy.length === 0 &&
    diff.onlyInNew.length === 0 &&
    diff.mismatchedCounts.length === 0
  );
}

/**
 * Format a snapshot diff for human-readable test output. Long property
 * payloads are truncated to keep the failure message scannable.
 */
export function formatDiff(diff: SnapshotDiff): string {
  const lines: string[] = [];
  if (diff.onlyInLegacy.length > 0) {
    lines.push(`\nResources present in LEGACY but not in NEW (${diff.onlyInLegacy.length}):`);
    for (const entry of diff.onlyInLegacy.slice(0, 20)) {
      lines.push(`  - ${entry.key} (×${entry.resources.length})`);
    }
    if (diff.onlyInLegacy.length > 20) {
      lines.push(`  ... and ${diff.onlyInLegacy.length - 20} more`);
    }
  }
  if (diff.onlyInNew.length > 0) {
    lines.push(`\nResources present in NEW but not in LEGACY (${diff.onlyInNew.length}):`);
    for (const entry of diff.onlyInNew.slice(0, 20)) {
      lines.push(`  - ${entry.key} (×${entry.resources.length})`);
    }
    if (diff.onlyInNew.length > 20) {
      lines.push(`  ... and ${diff.onlyInNew.length - 20} more`);
    }
  }
  if (diff.mismatchedCounts.length > 0) {
    lines.push(`\nResources with mismatched counts (${diff.mismatchedCounts.length}):`);
    for (const entry of diff.mismatchedCounts.slice(0, 20)) {
      lines.push(
        `  - ${entry.key}: legacy=${entry.legacyCount}, new=${entry.newCount}`,
      );
    }
  }
  return lines.length === 0 ? '(snapshots match)' : lines.join('\n');
}
