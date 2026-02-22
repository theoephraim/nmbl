import { compile } from './packages/parser/dist/index.mjs';

const nmblCode = `div.first-line
  p.second-line Hello
  span.third-line World
  
section.fifth-line
  h1.sixth-line Title`;

console.log('Testing line numbers in mappings...\n');

const { html, mappings } = compile(nmblCode);

console.log('Class mappings with line numbers:');
mappings
  .filter(m => m.metadata?.attributeName === 'class')
  .forEach(m => {
    const text = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    const sourceText = nmblCode.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
    console.log(`  "${text}" from source "${sourceText.substring(0, 20)}..." => Line ${m.sourceSpan.start.line + 1}`);
  });

console.log('\nElement mappings (first few):');
mappings
  .filter(m => m.metadata?.nodeType === 'Element')
  .slice(0, 10)
  .forEach(m => {
    const text = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    console.log(`  "${text}" => Line ${m.sourceSpan.start.line + 1}`);
  });
