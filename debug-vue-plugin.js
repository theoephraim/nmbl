import { compile } from './packages/parser/dist/index.mjs';

const nmblCode = `div.container
  p.text-bold Hello
  span.highlight World`;

console.log('Testing Vue plugin mapping logic...\n');

const { html, mappings } = compile(nmblCode);

// Focus on class mappings
const classMappings = mappings.filter(m => m.metadata?.attributeName === 'class');

console.log('Class mappings:');
classMappings.forEach(m => {
  const text = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
  console.log(`  "${text}"`);
  console.log(`    Source: line ${m.sourceSpan.start.line}, col ${m.sourceSpan.start.column}, offset ${m.sourceSpan.start.offset}`);
  console.log(`    Generated: offset ${m.generatedSpan.start.offset}-${m.generatedSpan.end.offset}`);
});

// Check if we're creating proper segments
console.log('\nSegments that would be created:');
let lastOffset = 0;
const sortedMappings = [...mappings].sort((a, b) =>
  a.generatedSpan.start.offset - b.generatedSpan.start.offset
);

let segmentCount = 0;
for (const mapping of sortedMappings) {
  if (mapping.generatedSpan.start.offset > lastOffset) {
    segmentCount++;
    console.log(`Segment ${segmentCount}: Unmapped text (${lastOffset}-${mapping.generatedSpan.start.offset})`);
  }
  
  segmentCount++;
  const text = html.substring(mapping.generatedSpan.start.offset, mapping.generatedSpan.end.offset);
  console.log(`Segment ${segmentCount}: "${text}" => source offset ${mapping.sourceSpan.start.offset}`);
  
  lastOffset = mapping.generatedSpan.end.offset;
}
