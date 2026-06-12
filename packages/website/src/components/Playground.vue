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
  .playground-editors
    .editor-pane
      .pane-header
        span NMBL
        span.pane-stats {{ nmblStats }}
      Editor(
        v-model="nmblSource"
        language="nmbl"
        placeholder="Write NMBL here..."
        @focus="activeEditor = 'nmbl'"
      )
    .editor-pane
      .pane-header
        span HTML
        span.pane-stats {{ htmlStats }}
      Editor(
        v-model="htmlSource"
        language="html"
        placeholder="Or paste HTML here..."
        @focus="activeEditor = 'html'"
      )
  .playground-error(v-if="error") {{ error }}
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { compile, decompile } from '@nmbl-lang/core';
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
const activeEditor = ref<'nmbl' | 'html'>('nmbl');
const error = ref('');

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// Initialize HTML from default NMBL
compileNmbl(PLAYGROUND_EXAMPLE_NMBL);

function compileNmbl(source: string) {
  try {
    const { html, errors } = compile(source, { framework: framework.value });
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
  if (activeEditor.value !== 'nmbl') return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => compileNmbl(value), 150);
});

watch(framework, () => {
  compileNmbl(nmblSource.value);
});

watch(htmlSource, (value) => {
  if (activeEditor.value !== 'html') return;
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
