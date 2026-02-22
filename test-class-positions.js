import { parse, compile } from './packages/parser/dist/index.mjs';

const input = `div#app.container.active
  p.text-bold Hello
  span(class="highlight")`;

console.log('NMBL Input:');
console.log(input);
console.log('\n=== AST ===');
const { ast } = parse(input);

// Look at the first element
const divElement = ast.children[0];
console.log('Div element:');
console.log('  tagName:', divElement.tagName);
console.log('  id:', divElement.id);
console.log('  classes:', divElement.classes);
console.log('  span:', divElement.span);

console.log('\n=== Compiled with mappings ===');
const result = compile(input);
console.log('HTML:', result.html);
console.log('\nMappings for classes/id:');
result.mappings
  .filter(m => m.metadata?.attributeName === 'class' || m.metadata?.attributeName === 'id')
  .forEach(m => {
    const generated = result.html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    const sourceText = input.substring(m.sourceSpan.start.offset, m.sourceSpan.end.offset);
    console.log(`Generated: "${generated}" | Source: "${sourceText}" | Source offset: ${m.sourceSpan.start.offset}-${m.sourceSpan.end.offset}`);
  });
