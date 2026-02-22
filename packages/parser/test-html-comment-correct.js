import { compile } from './dist/index.mjs';

const inputs = [
  '//- This should be a comment',
  '//! This should be an HTML comment'
];

for (const input of inputs) {
  const result = compile(input);
  console.log('Input:', input);
  console.log('HTML Output:', JSON.stringify(result.html));
  console.log('Has mappings:', result.mappings.length > 0);
  console.log('---');
}
