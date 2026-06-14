import { describe, it, expect } from 'vitest';
import {
  extractImportSource,
  extractComponentApi,
  extractMemberKeys,
  extractStringLiterals,
} from '../client/component-api';

describe('extractImportSource', () => {
  it('finds a default import', () => {
    const s = "import VButton from './components/VButton.vue';\nimport { ref } from 'vue';";
    expect(extractImportSource(s, 'VButton')).toBe('./components/VButton.vue');
  });

  it('finds a named import', () => {
    const s = "import { Badge, Icon } from './ui';";
    expect(extractImportSource(s, 'Badge')).toBe('./ui');
    expect(extractImportSource(s, 'Icon')).toBe('./ui');
  });

  it('returns null when not imported', () => {
    expect(extractImportSource("import x from 'y';", 'Nope')).toBeNull();
  });
});

describe('extractMemberKeys', () => {
  it('reads keys from a type-literal body, ignoring union values and nesting', () => {
    const body = `
      label?: string;
      type?: 'button' | 'submit' | 'reset';
      meta?: { nested: number };
      items: Array<{ id: number }>;
    `;
    expect(extractMemberKeys(body)).toEqual(['label', 'type', 'meta', 'items']);
  });

  it('does not pick up identifiers from inside values or strings', () => {
    const body = `color?: 'red' | 'blue'; size: keyof Sizes`;
    expect(extractMemberKeys(body)).toEqual(['color', 'size']);
  });
});

describe('extractStringLiterals', () => {
  it('reads event names from a runtime array', () => {
    expect(extractStringLiterals(`'click', "update", 'delete'`)).toEqual(['click', 'update', 'delete']);
  });
});

describe('extractComponentApi', () => {
  it('handles withDefaults(defineProps<Props>()) with a local interface (the common shape)', () => {
    const src = `<script setup lang="ts">
interface Props {
  label?: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}
const props = withDefaults(defineProps<Props>(), { variant: 'primary', disabled: false });
const emit = defineEmits<{ click: [event: MouseEvent]; update: [value: string]; delete: [] }>();
</script>`;
    const api = extractComponentApi(src);
    expect(api.props).toEqual(['label', 'variant', 'disabled']);
    expect(api.emits).toEqual(['click', 'update', 'delete']);
  });

  it('handles an inline type literal defineProps<{…}>()', () => {
    const src = `defineProps<{ title: string; count?: number }>()`;
    expect(extractComponentApi(src).props).toEqual(['title', 'count']);
  });

  it('handles a type alias', () => {
    const src = `type P = { a: string; b?: number }; defineProps<P>()`;
    expect(extractComponentApi(src).props).toEqual(['a', 'b']);
  });

  it('handles the runtime object form', () => {
    const src = `defineProps({ label: String, count: { type: Number, default: 0 } })`;
    expect(extractComponentApi(src).props).toEqual(['label', 'count']);
  });

  it('handles the runtime array emits form', () => {
    const src = `defineEmits(['click', 'change'])`;
    expect(extractComponentApi(src).emits).toEqual(['click', 'change']);
  });

  it('returns empty (graceful) when the props type is imported/unresolvable', () => {
    const src = `import type { Props } from './types'; defineProps<Props>()`;
    expect(extractComponentApi(src).props).toEqual([]);
  });
});
