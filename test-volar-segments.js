import { compile } from './packages/parser/dist/index.mjs';
import { toString } from 'muggle-string';

const nmblCode = `div.first
  p.second Hello
  span.third World`;

const { html, mappings } = compile(nmblCode);

// Simulate what the Vue plugin does
const codes = [];
let lastOffset = 0;

const sortedMappings = [...mappings].sort((a, b) =>
  a.generatedSpan.start.offset - b.generatedSpan.start.offset
);

for (const mapping of sortedMappings) {
  // Add unmapped content
  if (mapping.generatedSpan.start.offset > lastOffset) {
    const unmapped = html.substring(lastOffset, mapping.generatedSpan.start.offset);
    codes.push(unmapped);
  }

  // Add mapped segment
  const text = html.substring(
    mapping.generatedSpan.start.offset,
    mapping.generatedSpan.end.offset
  );

  codes.push([
    text,
    undefined,
    mapping.sourceSpan.start.offset,
  ]);

  lastOffset = mapping.generatedSpan.end.offset;
}

// Add remaining
if (lastOffset < html.length) {
  codes.push(html.substring(lastOffset));
}

console.log('Segments created:');
codes.forEach((segment, i) => {
  if (typeof segment === 'string') {
    console.log(`${i}: Unmapped: "${segment}"`);
  } else {
    console.log(`${i}: Mapped: "${segment[0]}" => offset ${segment[2]}`);
  }
});

console.log('\nFinal HTML:', toString(codes));
