import type { VueLanguagePlugin } from '@vue/language-core';
import type * as CompilerDOM from '@vue/compiler-dom';
import { SourceMap } from '@volar/source-map';
import { toString, type Segment } from 'muggle-string';
import { compile } from '@nmbl/parser';

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

  return {
    name: '@nmbl/vue-language-plugin',
    version: 2.1,

    getEmbeddedCodes(_fileName, sfc) {
      if (sfc.template?.lang === 'nmbl') {
        return [{
          id: 'template',
          lang: 'pug',  // Tell Volar to treat this like Pug for pattern detection
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

      // Parse HTML to Vue AST
      let ast = CompilerDOM.parse(parsed.htmlString, {
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
      });

      // Transform the AST
      CompilerDOM.transform(ast, options);

      // Walk the AST and remap all offsets from HTML to NMBL
      const visited = new Set<object>();
      visit(ast);

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
    },
  };
};

// Compile NMBL to HTML with source mappings
function compileWithMappings(nmblCode: string) {
  const codes: Segment<any>[] = [];

  // Compile NMBL to HTML with native mappings
  const { html, mappings, errors } = compile(nmblCode);

  if (errors.length > 0) {
    console.warn('NMBL compilation errors:', errors);
  }

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