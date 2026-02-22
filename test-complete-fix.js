import { compile } from './packages/parser/dist/index.mjs';

const nmblCode = `div#app.container.active
  p.text-bold Hello world
  span(class="highlight") Highlighted
  
section.footer
  p Another paragraph`;

console.log('Final comprehensive test of position mappings:\n');
console.log('NMBL Code:');
console.log(nmblCode);
console.log('\n---\n');

const { html, mappings } = compile(nmblCode);

console.log('Generated HTML:');
console.log(html);
console.log('\n---\n');

// Test ID mapping
const idMappings = mappings.filter(m => m.metadata?.attributeName === 'id');
console.log('ID mapping:');
idMappings.forEach(m => {
  const genText = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
  const srcText = nmblCode.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
  console.log(`  Generated "${genText}" from source "${srcText}" at line ${m.sourceSpan.start.line + 1}, col ${m.sourceSpan.start.column + 1}`);
});

// Test class mappings
console.log('\nClass mappings:');
mappings
  .filter(m => m.metadata?.attributeName === 'class')
  .forEach(m => {
    const genText = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    const srcText = nmblCode.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
    console.log(`  Generated "${genText}" from source "${srcText}" at line ${m.sourceSpan.start.line + 1}, col ${m.sourceSpan.start.column + 1}`);
  });

// Verify line numbers are preserved
console.log('\nLine number verification:');
const classLineNumbers = mappings
  .filter(m => m.metadata?.attributeName === 'class')
  .map(m => m.sourceSpan.start.line + 1);
console.log('  Class names found on lines:', classLineNumbers);
console.log('  Expected lines: [1, 1, 2, 3, 5]');
console.log('  Lines match:', JSON.stringify(classLineNumbers) === JSON.stringify([1, 1, 2, 3, 5]));
