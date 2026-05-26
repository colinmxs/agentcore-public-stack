/**
 * Repo-shape and workflow-shape tests.
 *
 * Verifies the repository structure matches the two-stack architecture:
 *   - No legacy stack files
 *   - No legacy workflow files
 *   - No legacy script directories
 *   - New workflows exist with correct structure
 *   - Construct directory structure is correct
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const ROOT = path.resolve(__dirname, '..', '..');
const INFRA_LIB = path.resolve(__dirname, '..', 'lib');
const WORKFLOWS = path.resolve(ROOT, '.github', 'workflows');
const SCRIPTS = path.resolve(ROOT, 'scripts');

describe('Repo shape — no legacy artifacts', () => {
  const legacyStackFiles = [
    'infrastructure-stack.ts',
    'app-api-stack.ts',
    'inference-api-stack.ts',
    'gateway-stack.ts',
    'rag-ingestion-stack.ts',
    'sagemaker-fine-tuning-stack.ts',
    'artifacts-stack.ts',
    'mcp-sandbox-stack.ts',
    'frontend-stack.ts',
  ];

  for (const file of legacyStackFiles) {
    it(`legacy stack file ${file} does not exist`, () => {
      expect(fs.existsSync(path.join(INFRA_LIB, file))).toBe(false);
    });
  }

  const legacyWorkflows = [
    'app-api.yml',
    'inference-api.yml',
    'gateway.yml',
    'infrastructure.yml',
    'rag-ingestion.yml',
    'sagemaker-fine-tuning.yml',
    'mcp-sandbox.yml',
    'frontend.yml',
    'artifacts.yml',
  ];

  for (const file of legacyWorkflows) {
    it(`legacy workflow ${file} does not exist`, () => {
      expect(fs.existsSync(path.join(WORKFLOWS, file))).toBe(false);
    });
  }

  const legacyScriptDirs = [
    'stack-app-api',
    'stack-inference-api',
    'stack-frontend',
    'stack-gateway',
    'stack-infrastructure',
    'stack-rag-ingestion',
    'stack-artifacts',
    'stack-mcp-sandbox',
    'stack-sagemaker-fine-tuning',
  ];

  for (const dir of legacyScriptDirs) {
    it(`legacy script directory scripts/${dir} does not exist`, () => {
      expect(fs.existsSync(path.join(SCRIPTS, dir))).toBe(false);
    });
  }
});

describe('Repo shape — new architecture files exist', () => {
  it('platform-stack.ts exists', () => {
    expect(fs.existsSync(path.join(INFRA_LIB, 'platform-stack.ts'))).toBe(true);
  });

  it('backend-stack.ts exists', () => {
    expect(fs.existsSync(path.join(INFRA_LIB, 'backend-stack.ts'))).toBe(true);
  });

  it('constructs/ directory exists with subdirectories', () => {
    const constructsDir = path.join(INFRA_LIB, 'constructs');
    expect(fs.existsSync(constructsDir)).toBe(true);
    const subdirs = fs.readdirSync(constructsDir).filter(
      f => fs.statSync(path.join(constructsDir, f)).isDirectory()
    );
    expect(subdirs.length).toBeGreaterThanOrEqual(10);
  });

  const newWorkflows = ['platform.yml', 'backend.yml', 'frontend-deploy.yml'];
  for (const file of newWorkflows) {
    it(`workflow ${file} exists`, () => {
      expect(fs.existsSync(path.join(WORKFLOWS, file))).toBe(true);
    });
  }

  const newScriptDirs = ['platform', 'backend', 'frontend', 'build'];
  for (const dir of newScriptDirs) {
    it(`scripts/${dir}/ exists`, () => {
      expect(fs.existsSync(path.join(SCRIPTS, dir))).toBe(true);
    });
  }

  it('scripts/stack-bootstrap/ is preserved', () => {
    expect(fs.existsSync(path.join(SCRIPTS, 'stack-bootstrap'))).toBe(true);
  });
});

describe('Workflow YAML shape', () => {
  function loadWorkflow(name: string): any {
    const content = fs.readFileSync(path.join(WORKFLOWS, name), 'utf-8');
    return yaml.parse(content);
  }

  describe('platform.yml', () => {
    let wf: any;
    beforeAll(() => { wf = loadWorkflow('platform.yml'); });

    it('has a deploy job', () => {
      expect(wf.jobs.deploy).toBeDefined();
    });

    it('has a test-infra gate that deploy waits on', () => {
      expect(wf.jobs['test-infra']).toBeDefined();
      // 'needs' can be a string or array; normalise.
      const needs = Array.isArray(wf.jobs.deploy.needs)
        ? wf.jobs.deploy.needs
        : [wf.jobs.deploy.needs];
      expect(needs).toContain('test-infra');
    });

    it('uses the configure-aws-credentials action', () => {
      const steps = wf.jobs.deploy.steps;
      const awsStep = steps.find((s: any) => s.uses?.includes('configure-aws-credentials'));
      expect(awsStep).toBeDefined();
    });
  });

  describe('backend.yml', () => {
    let wf: any;
    beforeAll(() => { wf = loadWorkflow('backend.yml'); });

    it('has one build job per image plus deploy', () => {
      expect(wf.jobs['build-app-api']).toBeDefined();
      expect(wf.jobs['build-inference-api']).toBeDefined();
      expect(wf.jobs['build-rag-ingestion']).toBeDefined();
      expect(wf.jobs.deploy).toBeDefined();
    });

    it('has test-infra and test-backend gates', () => {
      expect(wf.jobs['test-infra']).toBeDefined();
      expect(wf.jobs['test-backend']).toBeDefined();
    });

    it('every build job waits on test-backend (no docker work until python tests pass)', () => {
      const buildJobs = ['build-app-api', 'build-inference-api', 'build-rag-ingestion'];
      for (const j of buildJobs) {
        // 'needs' may be a string or array; normalise.
        const needs = Array.isArray(wf.jobs[j].needs)
          ? wf.jobs[j].needs
          : [wf.jobs[j].needs];
        expect(needs).toContain('test-backend');
      }
    });

    it('deploy waits on every build job and every test gate', () => {
      expect(wf.jobs.deploy.needs).toContain('build-app-api');
      expect(wf.jobs.deploy.needs).toContain('build-inference-api');
      expect(wf.jobs.deploy.needs).toContain('build-rag-ingestion');
      expect(wf.jobs.deploy.needs).toContain('test-infra');
      expect(wf.jobs.deploy.needs).toContain('test-backend');
    });

    it('each build job exposes the resulting image tag as an output', () => {
      expect(wf.jobs['build-app-api'].outputs.image_tag).toBeDefined();
      expect(wf.jobs['build-inference-api'].outputs.image_tag).toBeDefined();
      expect(wf.jobs['build-rag-ingestion'].outputs.image_tag).toBeDefined();
    });
  });

  describe('frontend-deploy.yml', () => {
    let wf: any;
    beforeAll(() => { wf = loadWorkflow('frontend-deploy.yml'); });

    it('has build, test-frontend, and deploy jobs', () => {
      expect(wf.jobs.build).toBeDefined();
      expect(wf.jobs['test-frontend']).toBeDefined();
      expect(wf.jobs.deploy).toBeDefined();
    });

    it('deploy waits on build and test-frontend', () => {
      expect(wf.jobs.deploy.needs).toContain('build');
      expect(wf.jobs.deploy.needs).toContain('test-frontend');
    });
  });

  describe('nightly-deploy-pipeline.yml', () => {
    let wf: any;
    beforeAll(() => { wf = loadWorkflow('nightly-deploy-pipeline.yml'); });

    it('chains platform → backend → frontend', () => {
      expect(wf.jobs['deploy-platform']).toBeDefined();
      expect(wf.jobs['deploy-backend']).toBeDefined();
      expect(wf.jobs['deploy-frontend']).toBeDefined();
      // deploy-backend waits on the three per-image build jobs;
      // each of those needs deploy-platform AND test-backend, so the
      // platform → backend ordering is preserved transitively, and
      // python tests gate the docker builds.
      expect(wf.jobs['build-app-api'].needs).toContain('deploy-platform');
      expect(wf.jobs['build-app-api'].needs).toContain('test-backend');
      expect(wf.jobs['build-inference-api'].needs).toContain('deploy-platform');
      expect(wf.jobs['build-inference-api'].needs).toContain('test-backend');
      expect(wf.jobs['build-rag-ingestion'].needs).toContain('deploy-platform');
      expect(wf.jobs['build-rag-ingestion'].needs).toContain('test-backend');
      expect(wf.jobs['deploy-backend'].needs).toContain('build-app-api');
      expect(wf.jobs['deploy-backend'].needs).toContain('build-inference-api');
      expect(wf.jobs['deploy-backend'].needs).toContain('build-rag-ingestion');
      expect(wf.jobs['deploy-frontend'].needs).toContain('deploy-backend');
    });
  });
});

describe('bin/infrastructure.ts shape', () => {
  it('imports only PlatformStack and BackendStack', () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, '..', 'bin', 'infrastructure.ts'), 'utf-8');
    expect(content).toContain("from '../lib/platform-stack'");
    expect(content).toContain("from '../lib/backend-stack'");
    expect(content).not.toContain('InfrastructureStack');
    expect(content).not.toContain('AppApiStack');
    expect(content).not.toContain('InferenceApiStack');
    expect(content).not.toContain('GatewayStack');
    expect(content).not.toContain('FrontendStack');
  });
});
