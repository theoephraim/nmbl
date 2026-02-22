import { compile } from './packages/parser/dist/index.mjs';

const nmblCode = `div.first-line
  p.second-line Hello
  span.third-line World
  
section.fifth-line
  h1.sixth-line Title`;

console.log('NMBL Code:');
console.log(nmblCode);
console.log('\n---\n');

const { html, mappings } = compile(nmblCode);

console.log('Generated HTML:');
console.log(html);
console.log('\n---\n');

console.log('Mappings Summary:');
console.log('Total mappings:', mappings.length);
console.log('\nClass mappings with line numbers:');

mappings
  .filter(m => m.metadata?.attributeName === 'class')
  .forEach(m => {
    const text = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    console.log(`  "${text}" => Line ${m.sourceSpan.start.line + 1}, Col ${m.sourceSpan.start.column + 1}`);
  });

console.log('\nText mappings with line numbers:');
mappings
  .filter(m => m.metadata?.nodeType === 'Text')
  .forEach(m => {
    const text = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    console.log(`  "${text}" => Line ${m.sourceSpan.start.line + 1}, Col ${m.sourceSpan.start.column + 1}`);
  });
