import { parse, compile } from './packages/parser/dist/index.mjs';

const input = `div#app.container.active
  p.text-bold Hello
  span(class="highlight")`;

console.log('NMBL Input:');
console.log(input);
console.log('\n=== AST ===');
const { ast } = parse(input);
console.log(JSON.stringify(ast, null, 2));

console.log('\n=== Compiled with mappings ===');
const result = compile(input);
console.log('HTML:', result.html);
console.log('\nMappings for classes:');
result.mappings
  .filter(m => m.metadata?.attributeName === 'class' || m.metadata?.attributeName === 'id')
  .forEach(m => {
    const generated = result.html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    console.log(`Generated: "${generated}" | Source offset: ${m.sourceSpan.start.offset}-${m.sourceSpan.end.offset}`);
  });
