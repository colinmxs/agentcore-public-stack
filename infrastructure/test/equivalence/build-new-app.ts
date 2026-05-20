/**
 * Stub builder for the new 2-stack architecture.
 *
 * This file exists so the equivalence test (`equivalence.test.ts`) can
 * import a stable function name from Phase 1 onward. Until Task 10–12
 * land it throws "not implemented", so the equivalence test fails
 * loudly — confirming the harness is wired correctly before there is
 * anything to compare.
 *
 * In Task 10/11/12 this body is replaced with the real Platform +
 * Backend instantiation.
 */

import * as cdk from 'aws-cdk-lib';

import { AppConfig } from '../../lib/config';

export function buildNewApp(_config: AppConfig): cdk.App {
  throw new Error(
    'buildNewApp() is not implemented yet — PlatformStack and ' +
      'BackendStack land in Tasks 10–12. The equivalence test is ' +
      'expected to fail until then. See ' +
      'infrastructure/test/equivalence/build-new-app.ts.',
  );
}
