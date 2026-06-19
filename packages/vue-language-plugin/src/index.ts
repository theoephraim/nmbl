import type { VueLanguagePlugin } from '@vue/language-core';
import type * as CompilerDOM from '@vue/compiler-dom';
import { SourceMap } from '@volar/source-map';
import { toString, type Segment } from 'muggle-string';
import { compile } from '@nmbl-lang/core';

// Helper to build source mappings
function buildMappings<T>(chunks: Segment<T>[]) {
  let length = 0;
  const mappings: Array<{
    sourceOffsets: number[];
    generatedOffsets: number[];
    lengths: number[];
    data: T;
  }> = [];

  for (const segment of chunks) {
    if (typeof segment === 'string') {
      length += segment.length;
    } else {
      mappings.push({
        sourceOffsets: [segment[2]],
        generatedOffsets: [length],
        lengths: [segment[0].length],
        data: segment[3]!,
      });
      length += segment[0].length;
    }
  }
  return mappings;
}

const plugin: VueLanguagePlugin = ({ modules }) => {
  const CompilerDOM = modules['@vue/compiler-dom'];
  // `compileTemplate` is `@vue/language-core`'s own template-compile entrypoint.
  // Unlike calling `CompilerDOM.parse`/`transform` directly, it injects
  // language-core's `transformIf`/`transformFor`/`transformElement`/`transformText`,
  // which is what produces correct type-narrowing inside `@if`/`@each` and
  // binding types for iterated items. This mirrors `@vue/language-plugin-pug`.
  const languageCore = modules['@vue/language-core'] as
    | typeof import('@vue/language-core')
    | undefined;

  return {
    name: '@nmbl-lang/vue-language-plugin',
    version: 2.1,

    getEmbeddedCodes(_fileName, sfc) {
      if (sfc.template?.lang === 'nmbl') {
        return [{
          id: 'template',
          // Report the embedded template's real language, NOT 'pug'. Labelling it
          // 'pug' makes Volar treat the region as `languageId: 'jade'`, which lets a
          // Pug diagnostic provider parse the raw NMBL text as Pug — it then chokes on
          // `@if`/`@each` ("unexpected text @"), since Pug control flow has no `@`.
          // Type-checking does NOT depend on this lang: codegen runs off the SFC's
          // own `template.lang === 'nmbl'` → compileSFCTemplate → AST (see
          // @vue/language-core's virtualCode/ir.js). This field only governs which
          // non-TS embedded services touch the raw template text.
          lang: 'nmbl',
        }];
      }
      return [];
    },

    resolveEmbeddedCode(_fileName, sfc, embeddedFile) {
      if (embeddedFile.id === 'template' && sfc.template?.lang === 'nmbl') {
        // Pass through the NMBL content - transformation happens in compileSFCTemplate
        embeddedFile.content.push([
          sfc.template.content,
          sfc.template.name,
          0,
          {
            verification: true,
            completion: true,
            semantic: true,
            navigation: true,
            structure: true,
            format: false,
          },
        ]);
      }
    },

    compileSFCTemplate(lang: string, template: string, options?: CompilerDOM.CompilerOptions) {
      if (lang !== 'nmbl') {
        return;
      }

      // Compile NMBL to HTML and build source mappings
      const parsed = compileWithMappings(template);
      const map = new SourceMap(parsed.mappings);

      // NOTE: NMBL's own compile errors + lint are surfaced by the NMBL VS Code
      // extension's DiagnosticCollection (source 'nmbl'), NOT here — Vue stamps
      // anything reported via onError/onWarn with source 'vue'. Only genuine Vue
      // template-compiler errors flow through the onError handler below.

      const compileOptions: CompilerDOM.CompilerOptions = {
        ...options,
        comments: true,
        onWarn(warning) {
          if (warning.loc) {
            warning.loc.start.offset = toNmblOffset(warning.loc.start.offset);
            warning.loc.end.offset = toNmblOffset(warning.loc.end.offset);
          }
          options?.onWarn?.(warning);
        },
        onError(error) {
          if (error.loc) {
            error.loc.start.offset = toNmblOffset(error.loc.start.offset);
            error.loc.end.offset = toNmblOffset(error.loc.end.offset);
          }
          options?.onError?.(error);
        },
      };

      // Prefer language-core's `compileTemplate` so the vIf/vFor/element/text
      // transforms run — these give type-narrowing inside `@if`/`@each`.
      // Fall back to a bare parse+transform if language-core isn't in `modules`.
      let ast: CompilerDOM.RootNode;
      if (languageCore?.compileTemplate) {
        ast = languageCore.compileTemplate(parsed.htmlString, compileOptions);
      } else {
        ast = CompilerDOM.parse(parsed.htmlString, compileOptions);
        CompilerDOM.transform(ast, compileOptions);
      }

      // Walk the AST and remap all offsets from HTML to NMBL
      const visited = new Set<object>();
      visit(ast);

      // Repair v-for nodes (see fixupVForNode for the why).
      fixupVForNodes(ast);

      return {
        ast,
        code: '',
        preamble: '',
      };

      function visit(obj: object) {
        for (const key in obj) {
          const value = (obj as any)[key];
          if (value && typeof value === 'object') {
            if (visited.has(value)) {
              continue;
            }
            visited.add(value);

            // Remap offset from HTML position to NMBL position
            if ('offset' in value && typeof value.offset === 'number') {
              const originalOffset = value.offset;
              value.offset = toNmblOffset(originalOffset);
            }

            visit(value);
          }
        }
      }

      function toNmblOffset(htmlOffset: number) {
        // Try exact mapping first
        for (const mapped of map.toSourceLocation(htmlOffset)) {
          return mapped[0];
        }

        // No exact mapping — scan backward to find the nearest mapped offset.
        // Return the source offset of the nearest preceding mapped character.
        // This avoids linear extrapolation errors (HTML syntax like `<div class="`
        // is much longer than NMBL's `div.`).
        for (let delta = 1; delta <= 500; delta++) {
          if (htmlOffset - delta >= 0) {
            for (const mapped of map.toSourceLocation(htmlOffset - delta)) {
              return mapped[0];
            }
          }
          if (htmlOffset + delta < parsed.htmlString.length) {
            for (const mapped of map.toSourceLocation(htmlOffset + delta)) {
              return mapped[0];
            }
          }
        }

        return -1;
      }

      // Repair every v-for node so `@vue/language-core`'s codegen can recover the
      // loop bindings.
      //
      // language-core's `parseVForNode` reconstructs the left-hand side of the loop
      // (`item`, or `(item, i)`) by *slicing* `node.loc.source` using the binding
      // offsets: `node.loc.source.slice(value.offset - node.offset, ...)`. That
      // assumes the offsets and `loc.source` share one coordinate space.
      //
      // For NMBL that assumption breaks twice over: (1) we've just remapped every
      // offset into NMBL source space while `loc.source` is still the generated
      // `v-for="item of items"` HTML, and (2) NMBL *reorders* the expression
      // (`@each(items as item)` → `item of items`), so even a perfect 1:1 mapping
      // couldn't line the two up. The slice ends up grabbing `v-fo` (from `v-for`)
      // instead of `item`, producing `for (const [v-fo] of …)` — invalid TS that
      // aborts type-checking for the whole template.
      //
      // The binding *text* is always correct on the parsed expression nodes
      // (`value`/`key`/`index`/`source` `.content`), so we rebuild a self-consistent
      // `loc.source` from those and pin the offsets so the slice returns it verbatim.
      // The binding offset is left as the (coarse) remapped NMBL position, which is
      // the right anchor for go-to-def. Applied uniformly — native `v-for="…"` already
      // round-trips, so this is a no-op for it beyond normalizing the source string.
      function fixupVForNodes(root: object) {
        const seen = new Set<object>();
        (function walk(obj: any) {
          if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
          seen.add(obj);
          if (obj.type === CompilerDOM.NodeTypes.FOR && obj.parseResult) {
            fixupVForNode(obj);
          }
          for (const key in obj) {
            if (key !== 'parent') walk(obj[key]);
          }
        })(root);
      }

      function fixupVForNode(node: any) {
        const { value, key, index } = node.parseResult ?? {};
        // The bindings, in v-for destructuring order: `(value, key, index)`.
        const bindings = [value, key, index].filter(Boolean);
        if (!bindings.length || !node.loc) return;

        const leftText = bindings.map((b: any) => b.content).join(', ');
        const base = value.loc.start.offset;
        const lastBinding = index ?? key ?? value;

        // Make `node.loc.source.slice(value.offset - node.offset, last.offset - node.offset)`
        // resolve to exactly `leftText`.
        node.loc.source = leftText;
        node.loc.start.offset = base;
        lastBinding.loc.end.offset = base + leftText.length;
      }
    },
  };
};

// Compile NMBL to HTML with source mappings
function compileWithMappings(nmblCode: string) {
  const codes: Segment<any>[] = [];

  // Compile NMBL to HTML with native mappings. NMBL compile errors are surfaced
  // as diagnostics by the NMBL VS Code extension (source 'nmbl'), not here.
  const { html, mappings, errors } = compile(nmblCode, { framework: 'vue' });

  // Sort mappings by generated position
  const sortedMappings = [...mappings]
    .sort((a, b) => a.generatedSpan.start.offset - b.generatedSpan.start.offset);

  // Create segments: precise mappings are mapped segments, gaps are plain strings.
  // The toNmblOffset function handles unmapped offsets by finding the nearest mapping.
  let lastOffset = 0;

  for (const mapping of sortedMappings) {
    const genStart = mapping.generatedSpan.start.offset;
    const genEnd = mapping.generatedSpan.end.offset;

    // Skip overlapping mappings
    if (genStart < lastOffset) continue;

    // Gap before this mapping — push as unmapped string
    if (genStart > lastOffset) {
      codes.push(html.substring(lastOffset, genStart));
    }

    // Precise mapping
    const text = html.substring(genStart, genEnd);
    codes.push([text, undefined, mapping.sourceSpan.start.offset]);

    lastOffset = genEnd;
  }

  // Remaining HTML after last mapping — push as unmapped
  if (lastOffset < html.length) {
    codes.push(html.substring(lastOffset));
  }

  return {
    htmlCode: codes,  // Return the segments array directly for Volar
    htmlString: toString(codes),  // Also provide the string version if needed
    mappings: buildMappings(codes),
    errors,
  };
}

module.exports = plugin;