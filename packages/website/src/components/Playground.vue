<template lang="nmbl">
.playground
  .playground-toolbar
    label.framework-label
      span Framework
      select.framework-select(v-model="framework")
        option(value="html") html
        option(value="vue") vue
        option(value="svelte") svelte
        option(value="astro") astro
    button.direction-toggle(@click="toggleDirection" :title="directionTitle")
      span.direction-side(:class="{ active: direction === 'nmbl-to-html' }") NMBL
      span.direction-arrow {{ direction === 'nmbl-to-html' ? '→' : '←' }}
      span.direction-side(:class="{ active: direction === 'html-to-nmbl' }") HTML
    span.direction-hint(v-if="direction === 'html-to-nmbl'") converting HTML → NMBL
  .playground-editors
    .editor-pane(:class="{ 'pane-output': direction === 'html-to-nmbl' }")
      .pane-header
        span NMBL
          span.pane-tag(v-if="direction === 'html-to-nmbl'") generated
        span.pane-stats {{ nmblStats }}
      Editor(
        v-model="nmblSource"
        language="nmbl"
        placeholder="Write NMBL here..."
        :readonly="direction === 'html-to-nmbl'"
      )
    .editor-pane(:class="{ 'pane-output': direction === 'nmbl-to-html' }")
      .pane-header
        span HTML
          span.pane-tag(v-if="direction === 'nmbl-to-html'") generated
        span.pane-stats {{ htmlStats }}
      Editor(
        v-model="htmlSource"
        language="html"
        placeholder="Paste HTML here..."
        :readonly="direction === 'nmbl-to-html'"
      )
  .playground-warning(v-if="pendingSwitch")
    p ⚠️ Converting HTML → NMBL is lossy: {{ pendingLossy.join(' and ') }} can't be recovered from the HTML, so they'll be dropped when the NMBL is regenerated.
    .warning-actions
      button.warning-confirm(@click="confirmSwitch") Convert anyway
      button.warning-cancel(@click="pendingSwitch = false") Keep my NMBL
  .playground-error(v-if="error") {{ error }}
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { compile, decompile } from '@nmbl-lang/core';
import { mdFilter } from '@nmbl-lang/core/markdown';
import Editor from './Editor.vue';
import { PLAYGROUND_EXAMPLE_NMBL } from '../examples';

const nmblSource = ref(PLAYGROUND_EXAMPLE_NMBL);
const htmlSource = ref('');
const framework = ref<'html' | 'vue' | 'svelte' | 'astro'>('html');

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
// explicit direction instead of focus-driven sync, because HTML → NMBL is
// LOSSY (dev comments and :md blocks don't survive a round trip) and should
// never silently overwrite handwritten NMBL.
const direction = ref<'nmbl-to-html' | 'html-to-nmbl'>('nmbl-to-html');
const error = ref('');

const directionTitle = computed(() =>
  direction.value === 'nmbl-to-html'
    ? 'Switch to converting HTML into NMBL'
    : 'Switch back to authoring NMBL');

/** Constructs the decompiler cannot reproduce from HTML. */
function lossyConstructs(nmbl: string): string[] {
  const found: string[] = [];
  // dev comments are stripped at compile (`//!` / `/*!` survive as HTML comments)
  if (/^\s*\/\/(?!!)/m.test(nmbl) || /\/\*(?!!)/.test(nmbl)) found.push('dev comments (//)');
  // a content-block introducer: a line ending in a glued `:` or `:mode`
  if (/^\s*\S+:(?:[a-z][a-zA-Z0-9]*)?\s*$/m.test(nmbl)) found.push('content blocks (:md, script:, …)');
  return found;
}

const pendingSwitch = ref(false);
const pendingLossy = ref<string[]>([]);

function toggleDirection() {
  if (direction.value === 'nmbl-to-html') {
    const lossy = lossyConstructs(nmblSource.value);
    if (lossy.length > 0) {
      pendingLossy.value = lossy;
      pendingSwitch.value = true;
      return;
    }
    confirmSwitch();
  } else {
    pendingSwitch.value = false;
    direction.value = 'nmbl-to-html';
    compileNmbl(nmblSource.value);
  }
}

function confirmSwitch() {
  pendingSwitch.value = false;
  direction.value = 'html-to-nmbl';
  decompileHtml(htmlSource.value);
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// Initialize HTML from default NMBL
compileNmbl(PLAYGROUND_EXAMPLE_NMBL);

function compileNmbl(source: string) {
  try {
    const { html, errors } = compile(source, { framework: framework.value, filters: { md: mdFilter } });
    if (errors.length > 0) {
      error.value = errors.map(e => e.message).join('\n');
    } else {
      error.value = '';
    }
    htmlSource.value = html;
  } catch (e) {
    error.value = String(e);
  }
}

function decompileHtml(source: string) {
  try {
    const nmbl = decompile(source);
    error.value = '';
    nmblSource.value = nmbl.trimEnd();
  } catch (e) {
    error.value = String(e);
  }
}

watch(nmblSource, (value) => {
  if (direction.value !== 'nmbl-to-html') return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => compileNmbl(value), 150);
});

watch(framework, () => {
  if (direction.value === 'nmbl-to-html') compileNmbl(nmblSource.value);
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
}

.framework-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.framework-select {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}

.framework-select:focus {
  outline: 1px solid var(--color-accent);
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

.direction-toggle:hover {
  border-color: var(--color-accent);
}

.direction-side.active {
  color: var(--color-text);
  font-weight: 600;
}

.direction-arrow {
  color: var(--color-accent);
  font-weight: 700;
}

.direction-hint {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.pane-tag {
  margin-left: 0.5rem;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  background: var(--color-bg-subtle, rgba(124, 110, 246, 0.12));
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
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.35);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
}

.playground-warning p {
  margin: 0;
  flex: 1;
  min-width: 16rem;
}

.warning-actions {
  display: flex;
  gap: 0.5rem;
}

.warning-actions button {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  padding: 0.3rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

.warning-confirm {
  border-color: rgba(234, 179, 8, 0.5) !important;
}

.warning-actions button:hover {
  border-color: var(--color-accent);
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
