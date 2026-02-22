import { parse } from './dist/index.mjs';

const input = '//- This is an HTML comment';
const result = parse(input);
console.log('Parse result:');
console.log(JSON.stringify(result, null, 2));
