import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from './sync-design-tokens.mjs';
import { computeContentHash } from './lib/validate-design-tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const REAL_VENDOR_ARTIFACT_DIR = join(REPO_ROOT, 'vendor', 'design-system');

const cleanupPaths: string[] = [];
afterEach(() => {
  while (cleanupPaths.length) rmSync(cleanupPaths.pop()!, { recursive: true, force: true });
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(dir);
  return dir;
}

/** A fake local "Knowledge checkout": a real git repo (so `git rev-parse
 * HEAD` works exactly as it would against a real authenticated checkout)
 * containing the artifact/schema files at the expected relative paths. */
function makeFakeKnowledgeCheckout({ manifest, tokens }: { manifest: object; tokens: object }): string {
  const dir = makeTempDir('fake-knowledge-');
  const artifactDir = join(dir, '10-design/DESIGN-SYSTEM/ARTIFACT/dist');
  const schemasDir = join(dir, '10-design/DESIGN-SYSTEM/ARTIFACT/schemas');
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(schemasDir, { recursive: true });

  const realManifestSchema = readFileSync(join(REAL_VENDOR_ARTIFACT_DIR, 'manifest.schema.json'), 'utf8');
  const realTokensSchema = readFileSync(join(REAL_VENDOR_ARTIFACT_DIR, 'tokens.schema.json'), 'utf8');

  writeFileSync(join(artifactDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(artifactDir, 'tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
  writeFileSync(join(schemasDir, 'manifest.schema.json'), realManifestSchema);
  writeFileSync(join(schemasDir, 'tokens.schema.json'), realTokensSchema);

  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'artifact commit'], { cwd: dir });

  return dir;
}

/** Add a second, unrelated commit on top — simulating Knowledge's HEAD
 * advancing through a governance-only change that never touches the
 * artifact/schema files at all. */
function addUnrelatedCommit(checkoutPath: string) {
  writeFileSync(join(checkoutPath, 'UNRELATED-GOVERNANCE-NOTE.md'), '# nothing to do with tokens\n');
  execFileSync('git', ['add', '-A'], { cwd: checkoutPath });
  execFileSync('git', ['commit', '-q', '-m', 'docs: unrelated governance note'], { cwd: checkoutPath });
}

function makeVendorFixtureDir(): { vendorArtifactDir: string; lockPath: string; generatedCssPath: string } {
  const dir = makeTempDir('vendor-fixture-');
  const vendorArtifactDir = join(dir, 'design-system');
  cpSync(REAL_VENDOR_ARTIFACT_DIR, vendorArtifactDir, { recursive: true });
  return {
    vendorArtifactDir,
    lockPath: join(dir, 'design-tokens.lock.json'),
    generatedCssPath: join(dir, 'design-tokens.css'),
  };
}

function currentRealManifestAndTokens() {
  return {
    manifest: JSON.parse(readFileSync(join(REAL_VENDOR_ARTIFACT_DIR, 'manifest.json'), 'utf8')),
    tokens: JSON.parse(readFileSync(join(REAL_VENDOR_ARTIFACT_DIR, 'tokens.json'), 'utf8')),
  };
}

describe('runSync — irrelevant upstream commit does not cause an update', () => {
  it('does NOT update vendor/ or the lock when Knowledge HEAD advances through an unrelated commit', () => {
    const { manifest, tokens } = currentRealManifestAndTokens();
    const knowledgeCheckout = makeFakeKnowledgeCheckout({ manifest, tokens });

    // Advance Knowledge's HEAD with a commit that never touches the artifact.
    addUnrelatedCommit(knowledgeCheckout);

    const fixture = makeVendorFixtureDir();
    const before = readFileSync(join(fixture.vendorArtifactDir, 'tokens.json'), 'utf8');

    const outcome = runSync({
      source: knowledgeCheckout,
      vendorArtifactDir: fixture.vendorArtifactDir,
      lockPath: fixture.lockPath,
      generatedCssPath: fixture.generatedCssPath,
    });

    expect(outcome.result).toBe('unchanged');
    const after = readFileSync(join(fixture.vendorArtifactDir, 'tokens.json'), 'utf8');
    expect(after).toBe(before);
  });
});

describe('runSync — materially changed artifact', () => {
  it('updates vendor/ and the lock, using the fetched commit as distributionCommit, when tokens.json actually differs', () => {
    const { manifest, tokens } = currentRealManifestAndTokens();
    // A genuine, valid content change: bump a chart color. Recompute
    // contentHash for the new content so the fetched manifest/tokens pair
    // is internally consistent (exactly what a real new Knowledge
    // generation run would produce).
    const changedTokens = structuredClone(tokens);
    changedTokens.semantic.color.light['chart-cash'] = '#123456';
    const changedManifest = { ...manifest, contentHash: computeContentHash(changedTokens) };

    const knowledgeCheckout = makeFakeKnowledgeCheckout({ manifest: changedManifest, tokens: changedTokens });
    const distributionCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: knowledgeCheckout, encoding: 'utf8' }).trim();

    const fixture = makeVendorFixtureDir();
    const outcome = runSync({
      source: knowledgeCheckout,
      vendorArtifactDir: fixture.vendorArtifactDir,
      lockPath: fixture.lockPath,
      generatedCssPath: fixture.generatedCssPath,
    });

    expect(outcome.result).toBe('updated');
    expect(outcome.distributionCommit).toBe(distributionCommit);

    const updatedTokens = JSON.parse(readFileSync(join(fixture.vendorArtifactDir, 'tokens.json'), 'utf8'));
    expect(updatedTokens.semantic.color.light['chart-cash']).toBe('#123456');

    const updatedLock = JSON.parse(readFileSync(fixture.lockPath, 'utf8'));
    expect(updatedLock.distributionCommit).toBe(distributionCommit);
    expect(updatedLock.contentHash).toBe(changedManifest.contentHash);

    // The generated CSS must be refreshed too, reflecting the new value.
    const updatedCss = readFileSync(fixture.generatedCssPath, 'utf8');
    expect(updatedCss).toContain('--ds-color-chart-cash: #123456;');
  });

  it('rejects and writes nothing when the fetched content fails validation (fail closed)', () => {
    const { manifest, tokens } = currentRealManifestAndTokens();
    const brokenTokens = structuredClone(tokens);
    brokenTokens.spacing.primitive['space-4'] = '2px'; // outside the approved set
    const knowledgeCheckout = makeFakeKnowledgeCheckout({ manifest, tokens: brokenTokens });

    const fixture = makeVendorFixtureDir();
    const before = readFileSync(join(fixture.vendorArtifactDir, 'tokens.json'), 'utf8');

    const outcome = runSync({
      source: knowledgeCheckout,
      vendorArtifactDir: fixture.vendorArtifactDir,
      lockPath: fixture.lockPath,
      generatedCssPath: fixture.generatedCssPath,
    });

    expect(outcome.result).toBe('rejected');
    const after = readFileSync(join(fixture.vendorArtifactDir, 'tokens.json'), 'utf8');
    expect(after).toBe(before);
  });
});

describe('resolveLocalHeadSha', () => {
  it('reads the real HEAD SHA of a local checkout with plain git, no credentials', () => {
    const { manifest, tokens } = currentRealManifestAndTokens();
    const knowledgeCheckout = makeFakeKnowledgeCheckout({ manifest, tokens });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: knowledgeCheckout, encoding: 'utf8' }).trim();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
