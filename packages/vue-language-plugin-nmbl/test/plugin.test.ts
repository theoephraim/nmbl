import { describe, test, expect, beforeAll } from 'vitest';
import * as CompilerDOM from '@vue/compiler-dom';

// The plugin is a CJS module (module.exports = plugin factory).
// Use createRequire to load it from the built dist.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pluginFactory = require('../dist/index.cjs') as (ctx: { modules: Record<string, unknown> }) => ReturnType<typeof import('../src/index.js')['default']>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

type PluginInstance = ReturnType<typeof pluginFactory>;

function makePlugin(): PluginInstance {
  return pluginFactory({ modules: { '@vue/compiler-dom': CompilerDOM } });
}

/**
 * Walk an AST object graph, visiting every unique node once.
 * Calls `visitor` for each object node encountered.
 */
function walkAst(root: object, visitor: (node: Record<string, unknown>) => void): void {
  const visited = new Set<object>();
  function walk(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);
    visitor(obj as Record<string, unknown>);
    if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else {
      for (const key of Object.keys(obj)) {
        if (key !== 'parent') walk((obj as Record<string, unknown>)[key]);
      }
    }
  }
  walk(root);
}

/**
 * Collect all AST nodes with a given Vue node type number.
 * Vue AST node types: 0=Root, 1=Element, 2=Text, 4=SimpleExpr, 5=Interpolation, 6=Attribute, 7=Directive
 */
function findByType(root: object, type: number): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  walkAst(root, node => {
    if ((node as any).type === type) results.push(node);
  });
  return results;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('@nmbl/vue-language-plugin', () => {
  let plugin: PluginInstance;

  beforeAll(() => {
    plugin = makePlugin();
  });

  describe('plugin factory', () => {
    test('exports a callable plugin factory', () => {
      expect(typeof pluginFactory).toBe('function');
    });

    test('factory returns a named plugin with version', () => {
      expect(plugin.name).toBe('@nmbl/vue-language-plugin');
      expect(plugin.version).toBeGreaterThan(0);
    });

    test('plugin implements compileSFCTemplate', () => {
      expect(typeof plugin.compileSFCTemplate).toBe('function');
    });

    test('plugin ignores non-nmbl languages', () => {
      const result = plugin.compileSFCTemplate?.('html', '<div>hello</div>', {});
      expect(result).toBeUndefined();
    });
  });

  describe('getEmbeddedCodes', () => {
    test('returns template embedded code for nmbl lang', () => {
      const sfc = {
        template: { lang: 'nmbl', content: 'div', name: 'template' },
      };
      const codes = plugin.getEmbeddedCodes?.('test.vue', sfc as any);
      expect(codes).toHaveLength(1);
      expect(codes![0].id).toBe('template');
    });

    test('returns empty array for non-nmbl lang', () => {
      const sfc = {
        template: { lang: 'html', content: '<div/>', name: 'template' },
      };
      const codes = plugin.getEmbeddedCodes?.('test.vue', sfc as any);
      expect(codes).toHaveLength(0);
    });
  });

  describe('resolveEmbeddedCode', () => {
    test('pushes source content for nmbl template embedded file', () => {
      const nmblSource = 'div#app\n  p Hello';
      const sfc = {
        template: { lang: 'nmbl', content: nmblSource, name: 'template' },
      };
      const embeddedFile = { id: 'template', content: [] as unknown[] };
      plugin.resolveEmbeddedCode?.('test.vue', sfc as any, embeddedFile as any);
      expect(embeddedFile.content.length).toBeGreaterThan(0);
      // First segment should include the full NMBL source
      const firstSeg = embeddedFile.content[0] as unknown[];
      expect(firstSeg[0]).toBe(nmblSource);
    });

    test('does not modify embedded file for non-template ids', () => {
      const sfc = {
        template: { lang: 'nmbl', content: 'div', name: 'template' },
      };
      const embeddedFile = { id: 'script', content: [] as unknown[] };
      plugin.resolveEmbeddedCode?.('test.vue', sfc as any, embeddedFile as any);
      expect(embeddedFile.content).toHaveLength(0);
    });
  });

  describe('compileSFCTemplate', () => {
    const nmblTemplate = 'div#app\n  p.lead {{ msg }}\n  button(@click="go") Go';

    // Offsets in nmblTemplate (0-indexed):
    // '#app'  → 3..7
    // 'p.lead'→ 10..16
    // '.lead' → 11..16
    // '{{ msg }}' → 17..26
    // 'msg'   → 20..23
    // 'button'→ 29..35
    // '@click'→ 36..42
    // 'Go'    → 49..51

    test('returns an AST from compileSFCTemplate for nmbl lang', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', nmblTemplate, {});
      expect(result).toBeDefined();
      expect(result!.ast).toBeDefined();
      // Root node (type 0) at the top
      expect((result!.ast as any).type).toBe(0);
    });

    test('AST contains the compiled element tree', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', nmblTemplate, {});
      // Type 1 = Element nodes
      const elements = findByType(result!.ast, 1);
      const tags = elements.map(e => (e as any).tag);
      expect(tags).toContain('div');
      expect(tags).toContain('p');
      expect(tags).toContain('button');
    });

    test('AST class attribute on <p> has offset remapped to NMBL source', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', nmblTemplate, {});
      // Type 6 = plain Attribute
      const attrs = findByType(result!.ast, 6) as Array<{ name: string; value: { content: string }; loc: { start: { offset: number }; end: { offset: number } } }>;
      const classAttr = attrs.find(a => a.name === 'class' && a.value?.content === 'lead');
      expect(classAttr).toBeDefined();
      // loc.start.offset should point to the ".lead" position in NMBL source (offset 11)
      expect(classAttr!.loc.start.offset).toBe(11);
      expect(classAttr!.loc.end.offset).toBe(16);
    });

    test('AST interpolation for {{ msg }} has offset remapped to NMBL source', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', nmblTemplate, {});
      // Type 5 = Interpolation
      const interps = findByType(result!.ast, 5) as Array<{ loc: { start: { offset: number } }; content: { loc: { start: { offset: number }; end: { offset: number } } } }>;
      expect(interps.length).toBeGreaterThan(0);

      const msgInterp = interps.find(i => {
        const inner = i.content?.loc;
        return inner && inner.start.offset >= 17 && inner.end.offset <= 30;
      });
      expect(msgInterp).toBeDefined();
      // Inner expression 'msg' should map to offset 20..23 in NMBL source
      expect(msgInterp!.content.loc.start.offset).toBe(20);
      expect(msgInterp!.content.loc.end.offset).toBe(23);
    });

    test('AST text node for "Go" has offset remapped to NMBL source', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', nmblTemplate, {});
      // Type 2 = Text
      const texts = findByType(result!.ast, 2) as Array<{ content: string; loc: { start: { offset: number }; end: { offset: number } } }>;
      const goText = texts.find(t => t.content === 'Go');
      expect(goText).toBeDefined();
      // 'Go' in nmblTemplate is at offset 49..51
      expect(goText!.loc.start.offset).toBe(49);
      expect(goText!.loc.end.offset).toBe(51);
    });

    test('returned code is empty string (Volar convention for compileSFCTemplate)', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', nmblTemplate, {});
      expect(result!.code).toBe('');
    });

    test('handles a minimal single-element template', () => {
      const result = plugin.compileSFCTemplate?.('nmbl', 'span Hello', {});
      expect(result).toBeDefined();
      expect(result!.ast).toBeDefined();
      const elements = findByType(result!.ast, 1) as Array<{ tag: string }>;
      expect(elements.some(e => e.tag === 'span')).toBe(true);
    });
  });
});
