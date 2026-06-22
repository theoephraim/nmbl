<template>
  <div ref="editorEl" class="editor-wrapper"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorView, Decoration, placeholder as cmPlaceholder } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, Annotation, Compartment, StateEffect, StateField } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { html as htmlLang } from '@codemirror/lang-html';
import { nmblLanguage } from '@nmbl-lang/codemirror';
import { markdownOverlay } from './markdown-overlay';
import { indentRainbow } from './indent-rainbow';

const props = defineProps<{
  modelValue: string;
  language: 'html' | 'nmbl';
  placeholder?: string;
  readonly?: boolean;
  /** Range to highlight + scroll to (cursor sync from the other pane). */
  highlight?: { from: number; to: number } | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'focus': [];
  /** Cursor moved by the user (offset into the document). */
  'cursor': [offset: number];
}>();

const editorEl = ref<HTMLElement>();
let view: EditorView | undefined;

// Annotation to distinguish programmatic updates from user edits
const externalUpdate = Annotation.define<boolean>();

// Reconfigurable read-only state (the pane that is the conversion TARGET)
const readonlyCompartment = new Compartment();
// readOnly blocks edits but keeps the pane SELECTABLE (cursor tracked), so a
// click in the generated pane can sync a highlight back to the source.
const readonlyExt = (ro: boolean) => EditorState.readOnly.of(ro);

// ── cursor-sync highlight: a mark decoration set imperatively from outside ──
const setSyncHighlight = StateEffect.define<{ from: number; to: number } | null>();
const syncMark = Decoration.mark({ class: 'cm-sync-highlight' });
const syncHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setSyncHighlight)) {
        deco = e.value && e.value.to > e.value.from
          ? Decoration.set([syncMark.range(e.value.from, e.value.to)])
          : Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: 'var(--color-surface)',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'none',
    caretColor: 'var(--color-accent)',
    padding: '1rem',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    color: 'var(--color-text-muted)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(var(--color-accent-rgb), 0.05)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(var(--color-accent-rgb), 0.2) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(var(--color-accent-rgb), 0.3) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-accent)',
  },
  '.cm-sync-highlight': {
    backgroundColor: 'rgba(var(--color-accent-rgb), 0.22)',
    outline: '1px solid rgba(var(--color-accent-rgb), 0.45)',
    borderRadius: '2px',
  },
  // Rainbow indent guides (see indent-rainbow.ts) — a thin coloured bar at the
  // start of each indent level. box-shadow, so no layout shift.
  '.cm-indent-rainbow': {
    opacity: '0.18',
  },
  '.cm-indent-rainbow-0': { boxShadow: 'inset 1.5px 0 0 var(--rainbow-0)' },
  '.cm-indent-rainbow-1': { boxShadow: 'inset 1.5px 0 0 var(--rainbow-1)' },
  '.cm-indent-rainbow-2': { boxShadow: 'inset 1.5px 0 0 var(--rainbow-2)' },
  '.cm-indent-rainbow-3': { boxShadow: 'inset 1.5px 0 0 var(--rainbow-3)' },
  '.cm-indent-rainbow-4': { boxShadow: 'inset 1.5px 0 0 var(--rainbow-4)' },
  '.cm-indent-rainbow-5': { boxShadow: 'inset 1.5px 0 0 var(--rainbow-5)' },
  // Markdown highlighting inside :md content blocks (see markdown-overlay.ts).
  '.cm-md-heading': {
    color: 'var(--color-text)',
    fontWeight: '700',
  },
  '.cm-md-strong': {
    color: 'var(--color-text)',
    fontWeight: '700',
  },
  '.cm-md-em': {
    fontStyle: 'italic',
  },
  '.cm-md-code': {
    color: 'var(--color-accent)',
  },
  '.cm-md-link': {
    color: 'var(--color-accent)',
    textDecoration: 'underline',
  },
  '.cm-md-list': {
    color: 'var(--color-text-muted)',
    fontWeight: '700',
  },
});

onMounted(() => {
  if (!editorEl.value) return;

  const extensions = [
    basicSetup,
    theme,
    indentRainbow,
    readonlyCompartment.of(readonlyExt(props.readonly ?? false)),
    syncHighlightField,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // Only emit if this was a user edit, not a programmatic update
        const isExternal = update.transactions.some(
          (t) => t.annotation(externalUpdate)
        );
        if (!isExternal) {
          emit('update:modelValue', update.state.doc.toString());
        }
      }
      if (update.focusChanged && update.view.hasFocus) {
        emit('focus');
      }
      // Only USER cursor movement syncs the other pane (programmatic updates
      // and unfocused selection churn would cause feedback loops).
      if (update.selectionSet && update.view.hasFocus) {
        emit('cursor', update.state.selection.main.head);
      }
    }),
  ];

  if (props.language === 'html') {
    extensions.push(htmlLang());
  } else if (props.language === 'nmbl') {
    extensions.push(nmblLanguage, markdownOverlay);
  }

  if (props.placeholder) {
    extensions.push(cmPlaceholder(props.placeholder));
  }

  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions,
    }),
    parent: editorEl.value,
  });
});

onBeforeUnmount(() => {
  view?.destroy();
});

watch(() => props.highlight, (h) => {
  if (!view) return;
  const len = view.state.doc.length;
  const range = h && h.from < len
    ? { from: Math.min(h.from, len), to: Math.min(h.to, len) }
    : null;
  view.dispatch({
    effects: [
      setSyncHighlight.of(range),
      ...(range ? [EditorView.scrollIntoView(range.from, { y: 'center' })] : []),
    ],
  });
});

watch(() => props.readonly, (ro) => {
  view?.dispatch({ effects: readonlyCompartment.reconfigure(readonlyExt(ro ?? false)) });
});

watch(() => props.modelValue, (newVal) => {
  if (!view) return;
  const current = view.state.doc.toString();
  if (current === newVal) return;

  view.dispatch({
    changes: {
      from: 0,
      to: current.length,
      insert: newVal,
    },
    annotations: externalUpdate.of(true),
  });
});
</script>

<style scoped>
.editor-wrapper {
  height: 100%;
  overflow: auto;
}

.editor-wrapper :deep(.cm-editor) {
  height: 100%;
}

.editor-wrapper :deep(.cm-scroller) {
  overflow: auto;
}
</style>
