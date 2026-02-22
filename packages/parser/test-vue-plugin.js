import { compile } from './dist/index.mjs';

// Test that compile now returns mappings
const input = `div#app
  p {{ message }}
  button(@click="handleClick") Click me`;

const result = compile(input);

console.log('Compile result has mappings:', result.mappings !== undefined);
console.log('Number of mappings:', result.mappings.length);
console.log('HTML output:', result.html);

// Sample mappings
console.log('\nSample mappings:');
result.mappings.slice(0, 5).forEach((m, i) => {
  const generated = result.html.substring(
    m.generatedSpan.start.offset,
    m.generatedSpan.end.offset
  );
  console.log(`${i}: "${generated}" - ${m.metadata?.nodeType} ${m.metadata?.attributeName || ''}`);
});
