/**
 * Snapshot capture for the legacy 9-stack architecture.
 *
 * This is NOT the equivalence gate (that lands in Task 2's
 * `equivalence.test.ts`). It exists to:
 *
 *   1. Exercise the snapshot+normalization pipeline end-to-end against
 *      a known-good architecture.
 *   2. Serialize the result to `__snapshots__/legacy-synth.json` as a
 *      historical baseline operators can diff against once the new
 *      architecture lands.
 *
 * Two representative configs are captured:
 *   - "all-features"  — every flag on (artifacts + mcpSandbox + fineTuning + ...)
 *   - "minimal"       — flags off (artifacts + mcpSandbox + fineTuning disabled)
 *
 * Run with: `npm test -- equivalence/snapshot-legacy`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { createMockConfig } from '../helpers/mock-config';
import { buildLegacyApp } from './build-legacy-app';
import { snapshotApp } from './normalize';

interface SerializableSnapshot {
  capturedAt: string;
  config: string;
  stackCount: number;
  stacks: string[];
  resourceCount: number;
  resourceTypeCounts: Record<string, number>;
}

const SNAPSHOT_DIR = path.join(__dirname, '__snapshots__');

function summarize(label: string, app: ReturnType<typeof buildLegacyApp>): SerializableSnapshot {
  const snap = snapshotApp(app);
  const resourceTypeCounts: Record<string, number> = {};
  let resourceCount = 0;
  for (const resources of Object.values(snap.resources)) {
    for (const r of resources) {
      resourceCount += 1;
      resourceTypeCounts[r.Type] = (resourceTypeCounts[r.Type] ?? 0) + 1;
    }
  }
  // Sort the type-counts map alphabetically for stable output.
  const sortedCounts: Record<string, number> = {};
  for (const k of Object.keys(resourceTypeCounts).sort()) {
    sortedCounts[k] = resourceTypeCounts[k];
  }
  return {
    capturedAt: new Date().toISOString().slice(0, 10),
    config: label,
    stackCount: snap.stacks.length,
    stacks: snap.stacks.slice().sort(),
    resourceCount,
    resourceTypeCounts: sortedCounts,
  };
}

describe('legacy-synth snapshot capture', () => {
  beforeAll(() => {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  });

  it('captures all-features synth', () => {
    // Artifacts + mcp-sandbox both create CloudFront distributions on
    // `<feature>.{domainName}` subdomains, so the all-features synth
    // requires a domain name, hosted-zone domain, and a us-east-1 ACM
    // cert ARN per feature. The values are dummy — only their *shape*
    // matters for the synth pipeline.
    const cert =
      'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000';
    const config = createMockConfig({
      domainName: 'example.com',
      infrastructureHostedZoneDomain: 'example.com',
      certificateArn: cert,
      frontend: { enabled: true, cloudFrontPriceClass: 'PriceClass_100', certificateArn: cert },
      artifacts: {
        enabled: true,
        retentionDays: 90,
        extraFrameAncestors: [],
        certificateArn: cert,
      },
      mcpSandbox: { enabled: true, extraFrameAncestors: [], certificateArn: cert },
      fineTuning: { enabled: true, defaultQuotaHours: 100 },
    });
    const app = buildLegacyApp(config);
    const summary = summarize('all-features', app);

    // Sanity: the legacy architecture has 9 stacks when every flag is on.
    expect(summary.stackCount).toBe(9);
    expect(summary.resourceCount).toBeGreaterThan(0);

    fs.writeFileSync(
      path.join(SNAPSHOT_DIR, 'legacy-synth.all-features.json'),
      JSON.stringify(summary, null, 2) + '\n',
    );
  });

  it('captures minimal synth', () => {
    const config = createMockConfig();
    const app = buildLegacyApp(config);
    const summary = summarize('minimal', app);

    // With artifacts/mcpSandbox/fineTuning disabled, 6 stacks remain
    // (Infrastructure, Frontend, AppApi, InferenceApi, Gateway, RagIngestion).
    expect(summary.stackCount).toBe(6);
    expect(summary.resourceCount).toBeGreaterThan(0);

    fs.writeFileSync(
      path.join(SNAPSHOT_DIR, 'legacy-synth.minimal.json'),
      JSON.stringify(summary, null, 2) + '\n',
    );
  });
});
