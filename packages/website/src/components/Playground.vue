<template lang="nmbl">
.playground
  .playground-editors
    .editor-pane
      .pane-header NMBL
      Editor(
        v-model="nmblSource"
        language="nmbl"
        placeholder="Write NMBL here..."
        @focus="activeEditor = 'nmbl'"
      )
    .editor-pane
      .pane-header HTML
      Editor(
        v-model="htmlSource"
        language="html"
        placeholder="Or paste HTML here..."
        @focus="activeEditor = 'html'"
      )
  .playground-error(v-if="error") {{ error }}
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { compile, decompile } from '@nmbl/parser';
import Editor from './Editor.vue';

const defaultNmbl = `nav.main-nav
  ul
    li: a(href="/") Home
    li: a(href="/about") About
    li: a(href="/contact") Contact

section#hero.dark
  h1 Welcome to NMBL
  p A concise template language for HTML

form(action="/subscribe" method="post")
  input(type="email" name="email" required)
  button(type="submit") Subscribe`;

const nmblSource = ref(defaultNmbl);
const htmlSource = ref('');
const activeEditor = ref<'nmbl' | 'html'>('nmbl');
const error = ref('');

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

// Initialize HTML from default NMBL
compileNmbl(defaultNmbl);

function compileNmbl(source: string) {
  try {
    const { html, errors } = compile(source);
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
