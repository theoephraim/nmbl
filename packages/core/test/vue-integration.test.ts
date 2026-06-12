import { describe, test, expect } from 'vitest';
import { compile } from '../src/index.js';

describe('Vue Integration - Source Mappings', () => {
  describe('CSS shorthand mappings', () => {
    test('maps CSS classes with dot prefix correctly', () => {
      const input = 'div.container.active';
      const result = compile(input);

      const classMappings = result.mappings.filter(m => m.metadata?.attributeName === 'class');
      expect(classMappings).toHaveLength(2); // One for each class

      // First class should map to the dot before 'container'
      const containerMapping = classMappings[0];
      const containerSrc = input.substring(containerMapping.sourceSpan.start.offset, containerMapping.sourceSpan.end.offset);
      expect(containerSrc).toBe('.container');

      // Second class should map to the dot before 'active'
      const activeMapping = classMappings[1];
      const activeSrc = input.substring(activeMapping.sourceSpan.start.offset, activeMapping.sourceSpan.end.offset);
      expect(activeSrc).toBe('.active');
    });

    test('maps CSS ID with hash prefix correctly', () => {
      const input = 'div#app.container';
      const result = compile(input);

      const idMapping = result.mappings.find(m => m.metadata?.attributeName === 'id');
      expect(idMapping).toBeDefined();

      if (idMapping) {
        const idSrc = input.substring(idMapping.sourceSpan.start.offset, idMapping.sourceSpan.end.offset);
        expect(idSrc).toBe('#app');
      }
    });

    test('handles mixed ID and classes', () => {
      const input = 'button#submit.btn.primary.large';
      const result = compile(input);

      const idMapping = result.mappings.find(m => m.metadata?.attributeName === 'id');
      const classMappings = result.mappings.filter(m => m.metadata?.attributeName === 'class');

      expect(idMapping).toBeDefined();
      expect(classMappings).toHaveLength(3); // btn, primary, large

      // Verify HTML output
      expect(result.html).toContain('id="submit"');
      expect(result.html).toContain('class="btn primary large"');
    });
  });

  describe('Attribute mappings', () => {
    test('maps both attribute names and values', () => {
      const input = 'button(@click="handleClick")';
      const result = compile(input);

      const clickMappings = result.mappings.filter(m => m.metadata?.attributeName === '@click');

      // Should have two mappings: one for name, one for value
      expect(clickMappings.length).toBeGreaterThanOrEqual(2);

      // Find the name mapping (should start with @)
      const nameMapping = clickMappings.find(m => {
        const text = input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
        return text.startsWith('@click');
      });
      expect(nameMapping).toBeDefined();

      // Find the value mapping (should include the quote)
      const valueMapping = clickMappings.find(m => {
        const text = input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
        return text.startsWith('"');
      });
      expect(valueMapping).toBeDefined();
    });

    test('handles v-model and other directives', () => {
      const input = 'input(v-model="username" :disabled="loading")';
      const result = compile(input);

      const vModelMappings = result.mappings.filter(m => m.metadata?.attributeName === 'v-model');
      const disabledMappings = result.mappings.filter(m => m.metadata?.attributeName === 'disabled');

      expect(vModelMappings.length).toBeGreaterThan(0);
      expect(disabledMappings.length).toBeGreaterThan(0);
    });

    test('handles template literals correctly', () => {
      const input = 'div(:title="`Hello ${name}`")';
      const result = compile(input);

      const titleMappings = result.mappings.filter(m => m.metadata?.attributeName === 'title');
      expect(titleMappings.length).toBeGreaterThan(0);

      // Should preserve template literal in output
      expect(result.html).toContain('`Hello ${name}`');
    });

    test('handles expression attributes', () => {
      const input = 'div(:count={items.length})';
      const result = compile(input);

      const countMappings = result.mappings.filter(m => m.metadata?.attributeName === 'count');
      expect(countMappings.length).toBeGreaterThan(0);

      // Expression should not have quotes
      expect(result.html).toContain(':count={items.length}');
    });
  });

  describe('Line and column calculations', () => {
    test('calculates correct line numbers for multi-line templates', () => {
      const input = `div
  h1.title
    | Hello
  p.content
    | World`;

      const result = compile(input);

      // Find h1 title class mapping
      const titleMapping = result.mappings.find(m =>
        m.metadata?.attributeName === 'class' &&
        input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset).includes('title')
      );

      expect(titleMapping).toBeDefined();
      if (titleMapping) {
        expect(titleMapping.sourceSpan.start.line).toBe(1); // h1.title is on line 1 (0-indexed)
      }

      // Find p content class mapping
      const contentMapping = result.mappings.find(m =>
        m.metadata?.attributeName === 'class' &&
        input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset).includes('content')
      );

      expect(contentMapping).toBeDefined();
      if (contentMapping) {
        expect(contentMapping.sourceSpan.start.line).toBe(3); // p.content is on line 3
      }
    });

    test('calculates correct column positions', () => {
      const input = 'div\n  p.container'; // Nested element with indent
      const result = compile(input);

      // Look for class mapping on the nested element
      const classMapping = result.mappings.find(m => m.metadata?.attributeName === 'class');
      expect(classMapping).toBeDefined();
      if (classMapping) {
        // The class ".container" starts at column 3 on line 1 (after "  p")
        expect(classMapping.sourceSpan.start.line).toBe(1); // Line 1 (0-indexed)
        expect(classMapping.sourceSpan.start.column).toBe(3); // Column 3 (after "  p")
      }
    });
  });

  describe('Complex real-world scenarios', () => {
    test('handles Vue SFC template correctly', () => {
      const input = `div#app
  h1.title
    | {{ message }}
  ul.list(v-if="items.length > 0")
    li(v-for="item in items" :key="item.id")
      span.item-name {{ item.name }}
      button.delete(@click="removeItem(item.id)")
        | Delete`;

      const result = compile(input);

      // Should have mappings for all classes
      const classMappings = result.mappings.filter(m => m.metadata?.attributeName === 'class');
      const classNames = ['title', 'list', 'item-name', 'delete'];

      classNames.forEach(className => {
        const mapping = classMappings.find(m => {
          const text = input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
          return text.includes(className);
        });
        expect(mapping).toBeDefined();
      });

      // Should have mappings for directives
      const vIfMapping = result.mappings.find(m => m.metadata?.attributeName === 'v-if');
      const vForMapping = result.mappings.find(m => m.metadata?.attributeName === 'v-for');
      const clickMapping = result.mappings.find(m => m.metadata?.attributeName === '@click');

      expect(vIfMapping).toBeDefined();
      expect(vForMapping).toBeDefined();
      expect(clickMapping).toBeDefined();
    });

    test('handles component with many props', () => {
      const input = `ItemCard(
  :title="item.name"
  :description="item.description"
  :count="index + 1"
  :highlighted="item.priority === 'high'"
  @click="handleClick"
  @delete="removeItem"
  class="custom-card"
  style="margin: 1rem"
)`;

      const result = compile(input);

      // Check that all attributes have mappings
      const attrNames = ['title', 'description', 'count', 'highlighted', '@click', '@delete', 'class', 'style'];

      attrNames.forEach(attrName => {
        const mappings = result.mappings.filter(m => m.metadata?.attributeName === attrName);
        expect(mappings.length).toBeGreaterThan(0);

        // Each should have correct line number
        const valueMapping = mappings.find(m => {
          const text = input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
          return text.startsWith('"') || text.startsWith('{');
        });

        if (valueMapping) {
          // Line numbers should be sequential (1, 2, 3, etc.)
          expect(valueMapping.sourceSpan.start.line).toBeGreaterThanOrEqual(1);
          expect(valueMapping.sourceSpan.start.line).toBeLessThanOrEqual(8);
        }
      });
    });
  });

  describe('Edge cases', () => {
    test('handles empty class list correctly', () => {
      const input = 'div';
      const result = compile(input);

      const classMappings = result.mappings.filter(m => m.metadata?.attributeName === 'class');
      expect(classMappings).toHaveLength(0);
      expect(result.html).toBe('<div></div>');
    });

    test('handles boolean attributes', () => {
      const input = 'input(disabled checked)';
      const result = compile(input);

      const disabledMapping = result.mappings.find(m => m.metadata?.attributeName === 'disabled');
      const checkedMapping = result.mappings.find(m => m.metadata?.attributeName === 'checked');

      expect(disabledMapping).toBeDefined();
      expect(checkedMapping).toBeDefined();
      expect(result.html).toContain('disabled');
      expect(result.html).toContain('checked');
    });

    test('handles attributes with special characters', () => {
      const input = 'div(@click.stop.prevent="handleClick")';
      const result = compile(input);

      const clickMapping = result.mappings.find(m => m.metadata?.attributeName === '@click.stop.prevent');
      expect(clickMapping).toBeDefined();
    });

    test('preserves exact offsets for Volar integration', () => {
      const input = 'button.btn(@click="test")';
      const result = compile(input);

      // The class "btn" in HTML should map to ".btn" in source
      const classMapping = result.mappings.find(m =>
        m.metadata?.attributeName === 'class' &&
        result.html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset).includes('btn')
      );

      expect(classMapping).toBeDefined();
      if (classMapping) {
        // Source should include the dot prefix
        const sourceText = input.substring(classMapping.sourceSpan.start.offset, classMapping.sourceSpan.end.offset);
        expect(sourceText).toContain('.btn');

        // The offset should point to the dot, not the 'b'
        expect(input[classMapping.sourceSpan.start.offset]).toBe('.');
      }
    });
  });

  describe('Mapping structure', () => {
    test('should have both broad element mappings and specific attribute mappings', () => {
      const input = `div#app.container
  button.btn.primary(@click="test" :disabled="loading")
    | Click me`;

      const result = compile(input);

      // We expect to have both element-level mappings and specific mappings
      // Element mappings may span the entire element including children
      const elementMappings = result.mappings.filter(m => m.metadata?.nodeType === 'Element');
      const classMappings = result.mappings.filter(m => m.metadata?.attributeName === 'class');
      const idMappings = result.mappings.filter(m => m.metadata?.attributeName === 'id');
      const clickMappings = result.mappings.filter(m => m.metadata?.attributeName === '@click');

      // Should have element mappings for div and button
      expect(elementMappings.length).toBeGreaterThan(0);

      // Should have specific mappings for classes
      expect(classMappings).toHaveLength(3); // container, btn, primary

      // Should have specific mapping for ID
      expect(idMappings).toHaveLength(1); // app

      // Should have mappings for @click (name and value)
      expect(clickMappings.length).toBeGreaterThanOrEqual(2);

      // Verify the specific mappings are precise
      const containerMapping = classMappings.find(m => {
        const text = input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
        return text.includes('container');
      });
      expect(containerMapping).toBeDefined();
      if (containerMapping) {
        const srcText = input.substring(containerMapping.sourceSpan.start.offset, containerMapping.sourceSpan.end.offset);
        expect(srcText).toBe('.container');
      }
    });
  });
});