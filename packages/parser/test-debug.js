import { compile } from './dist/index.mjs';

const input = `{#if a}
  p A
{:else if b}
  p B
{:else}
  p C`;

const result = compile(input, { framework: 'astro' });
console.log('HTML Output:');
console.log(result.html);
console.log('\nExpected:');
const expected = `{a ? (
  <p>A</p>
) : b ? (
  <p>B</p>
) : (
  <p>C</p>
)}`;
console.log(expected);
console.log('\nMatch:', result.html.trim() === expected);
