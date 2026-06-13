<template>
  <div ref="editorEl" class="editor-wrapper"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorView, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState, Annotation, Compartment } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { html as htmlLang } from '@codemirror/lang-html';
import { nmblLanguage } from '@nmbl-lang/codemirror';

const props = defineProps<{
  modelValue: string;
  language: 'html' | 'nmbl';
  placeholder?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'focus': [];
}>();

const editorEl = ref<HTMLElement>();
let view: EditorView | undefined;

// Annotation to distinguish programmatic updates from user edits
const externalUpdate = Annotation.define<boolean>();

// Reconfigurable read-only state (the pane that is the conversion TARGET)
const readonlyCompartment = new Compartment();
const readonlyExt = (ro: boolean) => [EditorState.readOnly.of(ro), EditorView.editable.of(!ro)];

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
    backgroundColor: 'rgba(124, 110, 246, 0.05)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(124, 110, 246, 0.2) !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(124, 110, 246, 0.3) !important',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--color-accent)',
  },
});

onMounted(() => {
  if (!editorEl.value) return;

  const extensions = [
    basicSetup,
    theme,
    readonlyCompartment.of(readonlyExt(props.readonly ?? false)),
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
    }),
  ];

  if (props.language === 'html') {
    extensions.push(htmlLang());
  } else if (props.language === 'nmbl') {
    extensions.push(nmblLanguage);
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
