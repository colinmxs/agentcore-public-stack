/**
 * Equivalence gate: legacy 9-stack synth ≡ new 2-stack synth.
 *
 * This test is the "perfection gate" for the stack architecture
 * simplification. Once Tasks 10–12 land, it runs the legacy and new
 * architectures through the normalize+snapshot pipeline and asserts
 * the resource union is byte-identical (modulo the expected deltas
 * documented in `normalize.ts`).
 *
 * STATE THROUGH PHASE 1 + PHASE 2: `buildNewApp` is a stub that throws
 * "not implemented", so the real comparison block is `describe.skip`'d
 * and a small "harness wiring" test asserts the stub is correctly
 * detected. This keeps CI green while still proving the harness
 * compiles and reaches the comparison code path.
 *
 * STATE FROM TASK 12 ONWARD: the `describe.skip` flips to `describe`
 * and the gate runs against the real new architecture.
 */

import { createMockConfig } from '../helpers/mock-config';
import { buildLegacyApp } from './build-legacy-app';
import { buildNewApp } from './build-new-app';
import {
  diffSnapshots,
  formatDiff,
  snapshotApp,
  snapshotsEqual,
} from './normalize';

describe('equivalence harness — wiring sanity', () => {
  it('legacy app builds and snapshots cleanly', () => {
    const config = createMockConfig();
    const app = buildLegacyApp(config);
    const snap = snapshotApp(app);
    expect(snap.stacks.length).toBeGreaterThan(0);
    expect(Object.keys(snap.resources).length).toBeGreaterThan(0);
  });

  it('buildNewApp stub fails loudly until PlatformStack/BackendStack land', () => {
    const config = createMockConfig();
    expect(() => buildNewApp(config)).toThrow(/not implemented/i);
  });
});

// ============================================================
// Equivalence gate (Tasks 10–12 will flip `describe.skip` → `describe`)
// ============================================================

describe.skip('equivalence gate: legacy ≡ new', () => {
  it('matches under minimal config (artifacts off, mcp-sandbox off, fine-tuning off)', () => {
    const config = createMockConfig();
    const legacySnap = snapshotApp(buildLegacyApp(config));
    const newSnap = snapshotApp(buildNewApp(config));

    const diff = diffSnapshots(legacySnap, newSnap);
    if (!snapshotsEqual(diff)) {
      throw new Error(
        `Legacy and new architectures diverged.\n${formatDiff(diff)}`,
      );
    }
  });

  it('matches under all-features config (every flag on)', () => {
    const cert =
      'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000';
    const config = createMockConfig({
      domainName: 'example.com',
      infrastructureHostedZoneDomain: 'example.com',
      certificateArn: cert,
      frontend: {
        enabled: true,
        cloudFrontPriceClass: 'PriceClass_100',
        certificateArn: cert,
      },
      artifacts: {
        enabled: true,
        retentionDays: 90,
        extraFrameAncestors: [],
        certificateArn: cert,
      },
      mcpSandbox: {
        enabled: true,
        extraFrameAncestors: [],
        certificateArn: cert,
      },
      fineTuning: { enabled: true, defaultQuotaHours: 100 },
    });
    const legacySnap = snapshotApp(buildLegacyApp(config));
    const newSnap = snapshotApp(buildNewApp(config));

    const diff = diffSnapshots(legacySnap, newSnap);
    if (!snapshotsEqual(diff)) {
      throw new Error(
        `Legacy and new architectures diverged.\n${formatDiff(diff)}`,
      );
    }
  });
});
