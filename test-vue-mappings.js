import { compile } from './packages/parser/dist/index.mjs';

const nmblCode = `div#app.container.active
  p.text-bold Hello
  span(class="highlight") World
  
div.second-div
  p Another paragraph`;

console.log('NMBL Input:');
console.log(nmblCode);
console.log('\n---\n');

const { html, mappings, errors } = compile(nmblCode);

console.log('Generated HTML:');
console.log(html);
console.log('\n---\n');

console.log('All Mappings:');
mappings.forEach((m, i) => {
  const generated = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
  const source = nmblCode.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
  console.log(`${i}: "${generated}" => "${source.replace(/\n/g, '\\n')}" | Gen: ${m.generatedSpan.start.offset}-${m.generatedSpan.end.offset} | Src: ${m.sourceSpan.start.offset}-${m.sourceSpan.end.offset} | ${m.metadata?.nodeType} ${m.metadata?.attributeName || ''}`);
});

console.log('\n---\n');
console.log('Class-related mappings only:');
mappings
  .filter(m => m.metadata?.attributeName === 'class' || (m.metadata?.nodeType === 'Attribute' && html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset).includes('class')))
  .forEach((m, i) => {
    const generated = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    const source = nmblCode.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
    console.log(`"${generated}" => line ${m.sourceSpan.start.line}, col ${m.sourceSpan.start.column}, offset ${m.sourceSpan.start.offset}`);
  });
