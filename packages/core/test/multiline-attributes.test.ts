import { describe, test, expect } from 'vitest';
import { compile } from '../src/index.js';

describe('Multi-line attribute mappings', () => {
  test('handles attributes on separate lines', () => {
    const input = `button(
  @click="handleClick"
  :disabled="isLoading"
  class="btn"
)`;
    const result = compile(input);

    // Find attribute VALUE mappings (skip the name mappings)
    const clickMapping = result.mappings.filter(m => m.metadata?.attributeName === '@click')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const disabledMapping = result.mappings.filter(m => m.metadata?.attributeName === 'disabled')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const classMapping = result.mappings.filter(m => m.metadata?.attributeName === 'class')
      .find(m => input[m.sourceSpan.start.offset] === '"');

    expect(clickMapping).toBeDefined();
    expect(disabledMapping).toBeDefined();
    expect(classMapping).toBeDefined();

    // Verify @click mapping
    if (clickMapping) {
      const srcText = input.substring(clickMapping.sourceSpan.start.offset, clickMapping.sourceSpan.end.offset);
      expect(srcText).toBe('"handleClick"');
      const genText = result.html.substring(clickMapping.generatedSpan.start.offset, clickMapping.generatedSpan.end.offset);
      expect(genText).toBe('"handleClick');
    }

    // Verify :disabled mapping
    if (disabledMapping) {
      const srcText = input.substring(disabledMapping.sourceSpan.start.offset, disabledMapping.sourceSpan.end.offset);
      expect(srcText).toBe('"isLoading"');
    }

    // Verify class mapping
    if (classMapping) {
      const srcText = input.substring(classMapping.sourceSpan.start.offset, classMapping.sourceSpan.end.offset);
      expect(srcText).toBe('"btn"');
    }
  });

  test('handles attributes with extra whitespace', () => {
    const input = `div(
  id    =    "app"
  class =    "container"
)`;
    const result = compile(input);

    const idMapping = result.mappings.filter(m => m.metadata?.attributeName === 'id')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const classMapping = result.mappings.filter(m => m.metadata?.attributeName === 'class')
      .find(m => input[m.sourceSpan.start.offset] === '"');

    expect(idMapping).toBeDefined();
    expect(classMapping).toBeDefined();

    if (idMapping) {
      const srcText = input.substring(idMapping.sourceSpan.start.offset, idMapping.sourceSpan.end.offset);
      expect(srcText).toBe('"app"');
    }

    if (classMapping) {
      const srcText = input.substring(classMapping.sourceSpan.start.offset, classMapping.sourceSpan.end.offset);
      expect(srcText).toBe('"container"');
    }
  });

  test('handles mixed single-line and multi-line attributes', () => {
    const input = `input(type="text"
  v-model="username"
  placeholder="Enter name" @keyup.enter="submit")`;

    const result = compile(input);

    const typeMapping = result.mappings.filter(m => m.metadata?.attributeName === 'type')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const vModelMapping = result.mappings.filter(m => m.metadata?.attributeName === 'v-model')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const placeholderMapping = result.mappings.filter(m => m.metadata?.attributeName === 'placeholder')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const keyupMapping = result.mappings.filter(m => m.metadata?.attributeName === '@keyup.enter')
      .find(m => input[m.sourceSpan.start.offset] === '"');

    expect(typeMapping).toBeDefined();
    expect(vModelMapping).toBeDefined();
    expect(placeholderMapping).toBeDefined();
    expect(keyupMapping).toBeDefined();

    // All mappings should point to the opening quote of their values
    if (typeMapping) {
      const srcChar = input[typeMapping.sourceSpan.start.offset];
      expect(srcChar).toBe('"');
    }

    if (vModelMapping) {
      const srcChar = input[vModelMapping.sourceSpan.start.offset];
      expect(srcChar).toBe('"');
    }
  });

  test('handles template literals and expressions', () => {
    const input = `component(
  :title="\`Hello \${name}\`"
  :count={items.length}
  :config="{ foo: 'bar' }"
)`;

    const result = compile(input);

    // Template literals in NMBL are written as "`...`" (with quotes), so look for the quote
    const titleMapping = result.mappings.filter(m => m.metadata?.attributeName === 'title')
      .find(m => input[m.sourceSpan.start.offset] === '"');
    const countMapping = result.mappings.filter(m => m.metadata?.attributeName === 'count')
      .find(m => input[m.sourceSpan.start.offset] === '{');
    const configMapping = result.mappings.filter(m => m.metadata?.attributeName === 'config')
      .find(m => input[m.sourceSpan.start.offset] === '"');

    expect(titleMapping).toBeDefined();
    expect(countMapping).toBeDefined();
    expect(configMapping).toBeDefined();

    // Template literal should map to the quote + backtick
    if (titleMapping) {
      const srcText = input.substring(titleMapping.sourceSpan.start.offset, titleMapping.sourceSpan.end.offset);
      expect(srcText).toContain('`');
    }

    // Expression (no quotes) should map to the opening brace
    if (countMapping) {
      const srcText = input.substring(countMapping.sourceSpan.start.offset, countMapping.sourceSpan.end.offset);
      expect(srcText).toBe('{items.length}');
    }
  });
});