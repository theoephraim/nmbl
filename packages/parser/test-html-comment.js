import { compile } from './dist/index.mjs';

const input = '//- This is an HTML comment';
const result = compile(input);
console.log('HTML Output:');
console.log(result.html);
console.log('\nMappings:');
console.log(result.mappings.map(m => ({
  generated: result.html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset),
  nodeType: m.metadata?.nodeType
})));
