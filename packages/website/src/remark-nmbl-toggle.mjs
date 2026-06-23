import { compile } from '@nmbl-lang/core';
import { mdFilter } from '@nmbl-lang/core/markdown';

// Turns ```nmbl fenced blocks in guide prose into flip-to-output toggles: it
// compiles the source at build time and emits the same markup CodeToggle.astro
// uses (styled by code-toggle.css, driven by the global code-toggle.ts script).
//
// - Compile target is the fence meta `framework=…` (`html` default). Framework
//   guides set it per block, e.g. ```nmbl framework=vue.
// - Blocks that don't compile cleanly (partial / illustrative fragments) are
//   left as plain code blocks. Opt out explicitly with a `no-toggle` meta flag.

const OUTPUT_LANG = {
  html: 'html', prompt: 'html', jsx: 'tsx',
  vue: 'vue', svelte: 'svelte', astro: 'astro',
};

const COLS = 6;

const BARS = Array.from({ length: COLS }, (_, i) => {
  const left = ((i * 100) / COLS).toFixed(4);
  const width = (100 / COLS).toFixed(4);
  return `<div class="ct-bar" data-col="${i}" style="--bar: var(--rainbow-${i}); left:${left}%; width:${width}%;"></div>`;
}).join('');

const OPEN =
  '<div class="code-toggle" data-cols="6">' +
  '<button class="ct-flip-btn" type="button" aria-label="Reveal compiled output" title="Reveal compiled output">' +
  '<span class="ct-brackets">' +
  '<svg class="ct-chev ct-chev-lt" width="13" height="16" viewBox="0 0 13 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8.5 3 4.5 8 8.5 13"></polyline></svg>' +
  '<svg class="ct-chev ct-chev-gt" width="13" height="16" viewBox="0 0 13 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4.5 3 8.5 8 4.5 13"></polyline></svg>' +
  '</span></button>' +
  `<div class="ct-stage"><div class="ct-bars" aria-hidden="true">${BARS}</div>` +
  '<div class="ct-face ct-front">';
const MID = '</div><div class="ct-face ct-back" aria-hidden="true">';
const CLOSE = '</div></div></div>';

function parseMeta(meta) {
  const out = {};
  if (!meta) return out;
  for (const m of meta.matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
    out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  if (/\bno-?toggle\b/.test(meta)) out.notoggle = true;
  return out;
}

export default function remarkNmblToggle() {
  return (tree) => {
    walk(tree, 'html');
  };
}

function walk(parent, fileFramework) {
  if (!parent || !Array.isArray(parent.children)) return;
  const next = [];
  for (const node of parent.children) {
    if (node.type === 'code' && node.lang === 'nmbl') {
      const toggle = toToggle(node, fileFramework);
      next.push(...(toggle ?? [node]));
      continue;
    }
    walk(node, fileFramework);
    next.push(node);
  }
  parent.children = next;
}

function toToggle(node, fileFramework) {
  const meta = parseMeta(node.meta);
  // Titled blocks are standalone files people copy (e.g. card.nmbl) — leave them
  // as plain copyable code, not toggles. `no-toggle` is an explicit opt-out.
  if (meta.notoggle || meta.title) return null;

  const framework = meta.framework || fileFramework;
  let output;
  try {
    const res = compile(node.value, { framework, filters: { md: mdFilter } });
    if (res.errors?.length) return null;
    output = (res.html || '').trimEnd();
  } catch {
    return null;
  }
  if (!output) return null;

  const outputLang = meta.outputLang || OUTPUT_LANG[framework] || 'html';
  return [
    { type: 'html', value: OPEN },
    { type: 'code', lang: 'nmbl', value: node.value },
    { type: 'html', value: MID },
    { type: 'code', lang: outputLang, value: output },
    { type: 'html', value: CLOSE },
  ];
}
