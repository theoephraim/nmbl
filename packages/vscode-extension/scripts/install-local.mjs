// Local dev installer for the NMBL extension.
//
// VS Code / Cursor / Windsurf don't just scan the extensions folder — they
// reconcile it against two bookkeeping files:
//   - extensions.json : the registry of recognized user extensions
//   - .obsolete       : folders to ignore / pending removal
//
// A hand-symlinked folder that isn't in extensions.json (or is stuck in
// .obsolete) silently won't load. This script keeps a live-symlinked install
// (so grammar edits reflect on reload, no repackaging) while writing correct,
// consistent bookkeeping in every editor.
//
// It is idempotent: safe to re-run any time.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const src = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));

// VS Code rejects scoped names (slash/@). Derive the canonical extension
// identity, rewriting the name to a legal one.
const NAME = 'nmbl';
const PUBLISHER = src.publisher ?? 'nmbl';
const VERSION = src.version;
const ID = `${PUBLISHER}.${NAME}`;
const FOLDER = `${ID}-${VERSION}`;

// Items symlinked into the install folder (everything the manifest references).
const LINKS = ['client', 'syntaxes', 'language-configuration.json', 'node_modules'];

// Warn early if the client hasn't been built — the extension would fail to activate.
if (!fs.existsSync(path.join(PKG_DIR, 'client', 'extension.js'))) {
  console.warn('⚠  client/extension.js missing — run `bun run build` first (continuing anyway).');
}

const EDITOR_DIRS = ['.vscode', '.cursor', '.windsurf']
  .map((d) => path.join(os.homedir(), d, 'extensions'))
  .filter((d) => fs.existsSync(d));

if (!EDITOR_DIRS.length) {
  console.log('No editor extensions directories found (.vscode/.cursor/.windsurf).');
  process.exit(0);
}

const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return fallback;
  }
};

for (const extDir of EDITOR_DIRS) {
  const folderPath = path.join(extDir, FOLDER);

  // 1. (Re)create the install folder with fresh symlinks + a rewritten manifest.
  fs.rmSync(folderPath, { recursive: true, force: true });
  fs.mkdirSync(folderPath, { recursive: true });
  for (const item of LINKS) {
    const target = path.join(PKG_DIR, item);
    if (fs.existsSync(target)) fs.symlinkSync(target, path.join(folderPath, item));
  }
  fs.writeFileSync(
    path.join(folderPath, 'package.json'),
    JSON.stringify({ ...src, name: NAME }, null, 2),
  );

  // 2. Clear any stale nmbl markers from .obsolete.
  const obsoletePath = path.join(extDir, '.obsolete');
  if (fs.existsSync(obsoletePath)) {
    const obsolete = readJson(obsoletePath, {});
    let changed = false;
    for (const key of Object.keys(obsolete)) {
      if (key.toLowerCase().startsWith('nmbl.')) {
        delete obsolete[key];
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(obsoletePath, JSON.stringify(obsolete));
  }

  // 3. Register a single, correct entry in extensions.json (drop stale nmbl ones).
  const regPath = path.join(extDir, 'extensions.json');
  const reg = readJson(regPath, []);
  const cleaned = Array.isArray(reg)
    ? reg.filter((e) => !String(e?.identifier?.id ?? '').toLowerCase().startsWith('nmbl.'))
    : [];
  cleaned.push({
    identifier: { id: ID },
    version: VERSION,
    location: { $mid: 1, path: folderPath, scheme: 'file' },
    relativeLocation: FOLDER,
  });
  fs.writeFileSync(regPath, JSON.stringify(cleaned));

  console.log(`✓ installed ${ID}@${VERSION} → ${extDir}`);
}

console.log('\nDone. Fully quit and reopen the editor (Cmd+Q, not just reload) to pick up the change.');
