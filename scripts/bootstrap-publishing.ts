/**
 * Bootstrap npm publishing for @nmbl-lang/* packages. Idempotent — safe to
 * re-run any time, including after adding a new package.
 *
 * Per package, in order:
 *   1. PUBLISH: if the package doesn't exist on npm yet, publish a v0 placeholder
 *      (a package.json-only tarball that just claims the name).
 *   2. TRUST:   if it has no trusted publisher, configure GitHub Actions OIDC
 *      via `npm trust github` (needs npm >= 11.10.0).
 *
 * Select packages by name or glob (required; quote globs). Defaults to a DRY RUN.
 *
 *   bun scripts/bootstrap-publishing.ts core --apply    # just @nmbl-lang/core
 *   bun scripts/bootstrap-publishing.ts "*-plugin"      # dry run, glob match
 *   bun scripts/bootstrap-publishing.ts "*" --apply     # all packages
 *   bun scripts/bootstrap-publishing.ts @nmbl-lang/cli @nmbl-lang/astro --apply
 *
 * Useful flags:
 *   --apply | -y         actually publish / configure (otherwise dry run)
 *   --skip-publish       only do the trust phase
 *   --skip-trust         only do the placeholder-publish phase
 *   --version=0.0.0      placeholder version (default 0.0.0)
 *   --otp=123456         npm OTP for the publish step
 *   --tag=next           dist-tag for the placeholder (default latest)
 *   --repo=owner/repo    trusted publisher repo   (default theoephraim/nmbl)
 *   --env=publish        trusted publisher environment (default publish)
 *   --workflow=release.yml  workflow whose publish job is trusted (default release.yml)
 *   --allow-stage-publish   also grant staged-publish permission
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCOPE = '@nmbl-lang/';

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('-'));
const positionals = argv.filter(a => !a.startsWith('-'));
const has = (f: string) => flags.includes(f);
const opt = (name: string, fallback: string) =>
  flags.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

const DRY = !(has('--apply') || has('--yes') || has('-y'));
const SKIP_PUBLISH = has('--skip-publish');
const SKIP_TRUST = has('--skip-trust');
const VERSION = opt('version', '0.0.0');
const otp = flags.find(a => a.startsWith('--otp='))?.slice('--otp='.length);
const tag = flags.find(a => a.startsWith('--tag='))?.slice('--tag='.length);
const REPO = opt('repo', 'theoephraim/nmbl');
const ENV = opt('env', 'publish');
const WORKFLOW = opt('workflow', 'release.yml');
const ALLOW_STAGE = has('--allow-stage-publish') || has('--allow-staged-publish');
const TRUST_DELAY_MS = 2000; // npm docs: space live trust calls to avoid rate limiting

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const capture = (cmd: string, a: string[]) => execFileSync(cmd, a, { encoding: 'utf8' }).trim();
const quiet = (cmd: string, a: string[]) =>
  execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });

// --- discover publishable packages ---
type Target = { name: string; manifest: Record<string, unknown> };
const all: Target[] = [];
for (const dir of readdirSync('packages')) {
  const file = join('packages', dir, 'package.json');
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (pkg.private || !String(pkg.name).startsWith(SCOPE)) continue;
  // placeholder manifest: descriptive metadata only, no entry points or deps
  const { name, description, keywords, license, author, homepage, repository } = pkg;
  all.push({
    name,
    manifest: { name, version: VERSION, description, keywords, license, author, homepage, repository },
  });
}

// --- select packages by name or glob (required; use "*" for all) ---
if (all.length === 0) {
  console.error('No publishable @nmbl-lang/* packages found. Run from the repo root.');
  process.exit(1);
}
if (positionals.length === 0) {
  console.error('Specify one or more packages by name or glob:');
  console.error('  bun scripts/bootstrap-publishing.ts core');
  console.error('  bun scripts/bootstrap-publishing.ts "*-plugin"     # globs must be quoted');
  console.error('  bun scripts/bootstrap-publishing.ts "*" --apply    # all packages');
  console.error(`\nAvailable: ${all.map(t => t.name).join(', ')}`);
  process.exit(1);
}

/** Glob (supports * and ?) against package names; bare names are auto-scoped. */
function globToRegExp(glob: string): RegExp {
  const pattern = glob.startsWith('@') ? glob : SCOPE + glob;
  const body = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${body}$`);
}

const selected = new Map<string, Target>();
for (const sel of positionals) {
  const re = globToRegExp(sel);
  const matches = all.filter(t => re.test(t.name));
  if (matches.length === 0) {
    console.error(`No package matches "${sel}".`);
    console.error(`Available: ${all.map(t => t.name).join(', ')}`);
    process.exit(1);
  }
  for (const m of matches) selected.set(m.name, m);
}
const targets = [...selected.values()];

const phases = [SKIP_PUBLISH ? null : 'publish', SKIP_TRUST ? null : 'trust'].filter(Boolean).join(' + ');
console.log(`${DRY ? '🧪 DRY RUN' : '🚀 APPLY'} — ${phases} for ${targets.length} package(s)`);
if (!SKIP_TRUST) {
  const perms = ['publish', ALLOW_STAGE && 'stage-publish'].filter(Boolean).join(',');
  console.log(`   trust: repo=${REPO}  workflow=${WORKFLOW}  env=${ENV}  permissions=${perms}`);
}
console.log();

// --- auth gate (only for real changes) ---
if (!DRY) {
  try {
    console.log(`✓ npm authenticated as: ${capture('npm', ['whoami'])}\n`);
  } catch {
    console.error('✗ Not logged in to npm. Run `npm login` (publish rights + 2FA for the @nmbl-lang org) and retry.');
    process.exit(1);
  }
}

function packageExists(name: string): boolean {
  try {
    quiet('npm', ['view', name, 'version']); // any version → name is claimed
    return true;
  } catch {
    return false;
  }
}

function trustConfigured(name: string): boolean {
  try {
    const parsed = JSON.parse(quiet('npm', ['trust', 'list', name, '--json']) || '[]');
    const list = Array.isArray(parsed) ? parsed : (parsed.trusted ?? parsed.relationships ?? []);
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

const stageDir = mkdtempSync(join(tmpdir(), 'nmbl-bootstrap-'));
const summary = { published: 0, pubSkipped: 0, trusted: 0, trustSkipped: 0, failed: 0 };

try {
  for (const t of targets) {
    console.log(`\n━━ ${t.name}`);

    // --- phase 1: ensure published at v0 ---
    let exists = packageExists(t.name);
    if (!SKIP_PUBLISH) {
      if (exists) {
        console.log(`  ⏭  publish: already on npm`);
        summary.pubSkipped++;
      } else {
        writeFileSync(join(stageDir, 'package.json'), JSON.stringify(t.manifest, null, 2) + '\n');
        const a = ['publish', '--access', 'public'];
        if (DRY) a.push('--dry-run');
        if (otp) a.push(`--otp=${otp}`);
        if (tag) a.push(`--tag=${tag}`);
        console.log(`  📦 publish: ${t.name}@${VERSION} (package.json only)`);
        try {
          execFileSync('bun', a, { cwd: stageDir, stdio: 'inherit' });
          summary.published++;
          if (!DRY) exists = true;
        } catch {
          console.error(`  ✗ publish failed`);
          summary.failed++;
        }
      }
    }

    // --- phase 2: ensure trusted publishing ---
    if (!SKIP_TRUST) {
      if (!exists && !DRY) {
        console.log(`  ⚠  trust: skipped — package isn't on npm yet (publish it first)`);
      } else if (trustConfigured(t.name)) {
        console.log(`  ⏭  trust: already configured`);
        summary.trustSkipped++;
      } else {
        const a = ['trust', 'github', t.name, '--file', WORKFLOW, '--repo', REPO, '--env', ENV, '--allow-publish'];
        if (ALLOW_STAGE) a.push('--allow-stage-publish');
        a.push(DRY ? '--dry-run' : '-y');
        console.log(`  🔐 trust: configuring GitHub Actions OIDC`);
        try {
          execFileSync('npm', a, { stdio: 'inherit' });
          summary.trusted++;
          if (!DRY) await sleep(TRUST_DELAY_MS);
        } catch {
          console.error(`  ✗ trust failed (npm >= 11.10.0? logged in with 2FA?)`);
          summary.failed++;
        }
      }
    }
  }
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}

console.log(
  `\n${DRY ? 'DRY RUN complete' : 'Done'} — ` +
    `published ${summary.published}/skipped ${summary.pubSkipped}, ` +
    `trusted ${summary.trusted}/skipped ${summary.trustSkipped}, failed ${summary.failed}.`,
);
if (DRY) console.log('Re-run with --apply to make changes (needs npm login + 2FA).');
if (summary.failed > 0) process.exit(1);
