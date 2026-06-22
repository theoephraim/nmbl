<template lang="nmbl">
.playground
  .playground-toolbar
    .framework-picker(role="tablist" aria-label="Framework")
      button.fw-btn(
        v-for="fw in FRAMEWORKS"
        :key="fw.value"
        type="button"
        role="tab"
        :class="{ active: framework === fw.value }"
        :aria-selected="framework === fw.value"
        :title="fw.label"
        @click="framework = fw.value"
      )
        img.fw-logo(:src="fw.icon" alt="" width="26" height="26")
        span.fw-name {{ fw.label }}
    button.direction-toggle(v-if="canReverse" @click="toggleDirection" :title="directionTitle")
      span.direction-side {{ direction === 'nmbl-to-html' ? 'nmbl' : 'HTML' }}
      span.direction-arrow →
      span.direction-side {{ direction === 'nmbl-to-html' ? 'HTML' : 'nmbl' }}
      span.swap-icon ⇄
    a.guide-link(:href="guide.href") {{ guide.label }} →
  .playground-warning(v-if="lossWarning.length")
    span ⚠️ Editing the HTML will regenerate the nmbl — {{ lossWarning.join(' and ') }} can't be recovered and will be dropped. Switch back now to keep them.
    button.warning-dismiss(@click="lossWarning = []" title="Dismiss") ×
  .playground-editors
    .editor-pane(:class="{ 'pane-output': direction === 'html-to-nmbl' }" :style="{ order: direction === 'html-to-nmbl' ? 2 : 1 }")
      .pane-header
        span nmbl
          span.pane-tag(v-if="direction === 'html-to-nmbl'") generated
        span.pane-stats {{ nmblStats }}
      Editor(
        v-model="nmblSource"
        language="nmbl"
        placeholder="Write nmbl here..."
        :readonly="direction === 'html-to-nmbl'"
        :highlight="nmblHighlight"
        @cursor="onNmblCursor"
      )
    .editor-pane(:class="{ 'pane-output': direction === 'nmbl-to-html' }" :style="{ order: direction === 'html-to-nmbl' ? 1 : 2 }")
      .pane-header
        span {{ outputLabel }}
          span.pane-tag(v-if="direction === 'nmbl-to-html'") generated
        span.pane-stats {{ htmlStats }}
      Editor(
        v-model="htmlSource"
        language="html"
        placeholder="Paste HTML here..."
        :readonly="direction === 'nmbl-to-html'"
        :highlight="htmlHighlight"
        @cursor="onHtmlCursor"
      )
  .playground-error(v-if="error") {{ error }}
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { compile, decompile, type SourceMapping } from '@nmbl-lang/core';
import { mdFilter } from '@nmbl-lang/core/markdown';
import Editor from './Editor.vue';
import { PLAYGROUND_EXAMPLES, type PlaygroundFramework } from '../examples';

const framework = ref<PlaygroundFramework>('html');

// The icon picker that replaces the framework dropdown.
const FRAMEWORKS: { value: PlaygroundFramework; label: string; icon: string }[] = [
  { value: 'html', label: 'HTML', icon: '/logos/html5.svg' },
  { value: 'vue', label: 'Vue', icon: '/logos/vue.svg' },
  { value: 'svelte', label: 'Svelte', icon: '/logos/svelte.svg' },
  { value: 'astro', label: 'Astro', icon: '/logos/astro.svg' },
  { value: 'react', label: 'React', icon: '/logos/react.svg' },
  { value: 'solid', label: 'Solid', icon: '/logos/solid.svg' },
  { value: 'qwik', label: 'Qwik', icon: '/logos/qwik.svg' },
  { value: 'prompt', label: 'Prompt', icon: '/logos/prompt.svg' },
];

const nmblSource = ref(PLAYGROUND_EXAMPLES[framework.value]);
const htmlSource = ref('');

// The last example we loaded — lets us swap to another framework's example on
// selector change WITHOUT clobbering edits (only swap if the source is still
// the pristine example we put there).
let loadedExample = nmblSource.value;

function countLines(s: string) {
  return s ? s.split('\n').length : 0;
}

const nmblStats = computed(() => {
  const lines = countLines(nmblSource.value);
  const chars = nmblSource.value.length;
  const htmlChars = htmlSource.value.length;
  const reduction = htmlChars > 0 ? Math.round((1 - chars / htmlChars) * 100) : 0;
  return `${lines} lines, ${chars} chars` + (reduction > 0 ? ` (${reduction}% smaller)` : '');
});

const htmlStats = computed(() => {
  const lines = countLines(htmlSource.value);
  const chars = htmlSource.value.length;
  return `${lines} lines, ${chars} chars`;
});
// Which pane is the SOURCE. The other pane is generated (read-only) — an
// explicit direction instead of focus-driven sync, because HTML → nmbl is
// LOSSY (dev comments and :md blocks don't survive a round trip) and should
// never silently overwrite handwritten nmbl.
const direction = ref<'nmbl-to-html' | 'html-to-nmbl'>('nmbl-to-html');
const error = ref('');

// Contextual link to the setup guide for the selected framework. Only the Vue
// guide is published yet; the rest point at the guides index until they ship.
const GUIDES: Record<PlaygroundFramework, { href: string; label: string }> = {
  html: { href: '/guides', label: 'Integration guides' },
  vue: { href: '/guides/vue', label: 'Using nmbl with Vue' },
  svelte: { href: '/guides/svelte', label: 'Using nmbl with Svelte' },
  astro: { href: '/guides/astro', label: 'Using nmbl with Astro' },
  react: { href: '/guides/react', label: 'Using nmbl with React' },
  solid: { href: '/guides/solid', label: 'Using nmbl with Solid' },
  qwik: { href: '/guides/qwik', label: 'Using nmbl with Qwik' },
  prompt: { href: '/guides/prompts', label: 'nmbl for prompts' },
};
const guide = computed(() => GUIDES[framework.value]);

// Output pane label per target: HTML for vue/svelte/astro/html, JSX for the
// tagged-template frameworks, structured text for 'prompt'.
const outputLabel = computed(() => {
  const fw = framework.value;
  if (fw === 'prompt') return 'Prompt';
  if (fw === 'react' || fw === 'solid' || fw === 'qwik') return 'JSX';
  return 'HTML';
});

// PlaygroundFramework → core compile options. react/solid both target 'jsx';
// React additionally aliases class→className / for→htmlFor.
function compileOptionsFor(fw: PlaygroundFramework) {
  if (fw === 'react') return { framework: 'jsx' as const, attributeAliases: { class: 'className', for: 'htmlFor' } };
  if (fw === 'solid') return { framework: 'jsx' as const, jsxRawHtml: 'solid' as const };
  // Qwik is JSX too, but keeps native HTML attribute names (class/for) and uses
  // dangerouslySetInnerHTML for raw-HTML blocks (the default jsxRawHtml).
  if (fw === 'qwik') return { framework: 'jsx' as const };
  return { framework: fw };
}

// HTML → nmbl only makes sense for the html target — the decompiler turns plain
// HTML back into nmbl, and framework output ({#each}, <template v-for>, client:
// directives, …) wouldn't round-trip.
const canReverse = computed(() => framework.value === 'html');

const directionTitle = computed(() =>
  !canReverse.value
    ? 'HTML → nmbl conversion is only available for the html target'
    : direction.value === 'nmbl-to-html'
      ? 'Switch to converting HTML into nmbl'
      : 'Switch back to authoring nmbl');

/** Constructs the decompiler cannot reproduce from HTML. */
function lossyConstructs(nmbl: string): string[] {
  const found: string[] = [];
  // dev comments are stripped at compile (`//!` / `/*!` survive as HTML comments)
  if (/^\s*\/\/(?!!)/m.test(nmbl) || /\/\*(?!!)/.test(nmbl)) found.push('dev comments (//)');
  // a content-block introducer: a line ending in a glued `:` or `:mode`
  if (/^\s*\S+:(?:[a-z][a-zA-Z0-9]*)?\s*$/m.test(nmbl)) found.push('content blocks (:md, script:, …)');
  return found;
}

const lossWarning = ref<string[]>([]);

// Toggling is NON-destructive: the panes swap sides and the HTML becomes the
// source, but the handwritten nmbl stays untouched until the HTML is actually
// edited (the htmlSource watch runs the first decompile). Switching back
// before editing loses nothing — the warning is informational, not a gate.
function toggleDirection() {
  nmblHighlight.value = null;
  htmlHighlight.value = null;
  if (direction.value === 'nmbl-to-html') {
    direction.value = 'html-to-nmbl';
    lossWarning.value = lossyConstructs(nmblSource.value);
  } else {
    direction.value = 'nmbl-to-html';
    lossWarning.value = [];
    compileNmbl(nmblSource.value);
  }
}

// ── cursor sync: the compiler's source↔generated mappings drive a highlight
// in the opposite pane. Only meaningful in nmbl → HTML mode (the decompiler
// has no mappings, and hand-edited HTML wouldn't match compiled offsets).
let mappings: SourceMapping[] = [];
const htmlHighlight = ref<{ from: number; to: number } | null>(null);
const nmblHighlight = ref<{ from: number; to: number } | null>(null);

function findMapping(offset: number, side: 'sourceSpan' | 'generatedSpan'): SourceMapping | null {
  let best: SourceMapping | null = null;
  let bestWidth = Infinity;
  for (const m of mappings) {
    const sp = m[side];
    if (offset < sp.start.offset || offset > sp.end.offset) continue;
    const width = sp.end.offset - sp.start.offset;
    if (width < bestWidth) { best = m; bestWidth = width; }
  }
  return best;
}

function onNmblCursor(offset: number) {
  if (direction.value !== 'nmbl-to-html') return;
  nmblHighlight.value = null; // active pane stays clean; highlight the other one
  const m = findMapping(offset, 'sourceSpan');
  htmlHighlight.value = m ? { from: m.generatedSpan.start.offset, to: m.generatedSpan.end.offset } : null;
}

function onHtmlCursor(offset: number) {
  if (direction.value !== 'nmbl-to-html') return;
  htmlHighlight.value = null;
  const m = findMapping(offset, 'generatedSpan');
  nmblHighlight.value = m ? { from: m.sourceSpan.start.offset, to: m.sourceSpan.end.offset } : null;
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// Initialize HTML from default nmbl
compileNmbl(nmblSource.value);

function compileNmbl(source: string) {
  try {
    const { html, errors, mappings: m } = compile(source, { ...compileOptionsFor(framework.value), filters: { md: mdFilter } });
    if (errors.length > 0) {
      error.value = errors.map(e => e.message).join('\n');
    } else {
      error.value = '';
    }
    htmlSource.value = html;
    mappings = m;
  } catch (e) {
    error.value = String(e);
  }
}

function decompileHtml(source: string) {
  try {
    const nmbl = decompile(source);
    error.value = '';
    nmblSource.value = nmbl.trimEnd();
    lossWarning.value = []; // the regenerate happened; the warning is moot
  } catch (e) {
    error.value = String(e);
  }
}

watch(nmblSource, (value) => {
  if (direction.value !== 'nmbl-to-html') return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => compileNmbl(value), 150);
});

watch(framework, (next) => {
  // Leaving html while reverse-converting: snap back to authoring nmbl (the
  // reverse direction isn't available for framework targets).
  if (next !== 'html' && direction.value === 'html-to-nmbl') {
    direction.value = 'nmbl-to-html';
    lossWarning.value = [];
  }
  if (direction.value !== 'nmbl-to-html') return;
  // Swap in the new framework's idiomatic example, but only if the editor still
  // holds the example we loaded (never overwrite the user's own nmbl).
  if (nmblSource.value === loadedExample) {
    loadedExample = PLAYGROUND_EXAMPLES[next];
    nmblSource.value = loadedExample;
  }
  compileNmbl(nmblSource.value);
});

watch(htmlSource, (value) => {
  if (direction.value !== 'html-to-nmbl') return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => decompileHtml(value), 150);
});
</script>

<style scoped>
.playground {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 200px);
  min-height: 500px;
}

.playground-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}

.framework-picker {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.fw-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 60px;
  padding: 0.5rem 0.25rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.fw-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-text);
}

.fw-btn.active {
  border-color: var(--color-accent);
  background: rgba(var(--color-accent-rgb), 0.1);
  color: var(--color-text);
}

.fw-logo {
  width: 26px;
  height: 26px;
}

/* html/prompt have no brand color, so de-emphasize all logos until selected */
.fw-btn:not(.active) .fw-logo {
  filter: grayscale(0.6);
  opacity: 0.8;
}

.fw-name {
  font-family: var(--font-mono);
  font-size: 0.7rem;
}

.guide-link {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-accent);
  text-decoration: none;
  white-space: nowrap;
}

.guide-link:hover {
  text-decoration: underline;
}

.direction-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.25rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: border-color 0.15s;
}

.direction-toggle:hover:not(:disabled) {
  border-color: var(--color-accent);
}

.direction-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.direction-arrow {
  color: var(--color-accent);
  font-weight: 700;
}

.swap-icon {
  margin-left: 0.25rem;
  color: var(--color-text-muted);
}

.direction-side {
  color: var(--color-text);
  font-weight: 600;
}

.pane-tag {
  margin-left: 0.5rem;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  background: var(--color-bg-subtle, rgba(var(--color-accent-rgb), 0.12));
  font-size: 0.65rem;
  font-weight: 400;
  text-transform: lowercase;
  letter-spacing: 0;
  color: var(--color-text-muted);
}

.pane-output :deep(.cm-content) {
  opacity: 0.85;
}

.playground-editors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--color-border);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
  flex: 1;
}

.editor-pane {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  min-height: 0;
  /* a grid item's min-width defaults to its content — a long unwrapped editor
     line would widen the column past 1fr and push the other pane off-screen */
  min-width: 0;
}

.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
}

.pane-stats {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.7;
}

.playground-warning {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.5rem 1rem;
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.35);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
}

.playground-warning span {
  flex: 1;
}

.warning-dismiss {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
}

.warning-dismiss:hover {
  color: var(--color-text);
}

.playground-error {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .playground-editors {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
}
</style>
