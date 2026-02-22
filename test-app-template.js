import { compile } from './packages/parser/dist/index.mjs';

// Simulate the actual template content from App.vue (what sfc.template.content would be)
const nmblCode = `
div#app
  h1.title
    | NMBL + Vue Example
  div.content(v-if="loggedIn")
    p.welcome Welcome back!`;

const { html, mappings } = compile(nmblCode);

const nmblLines = nmblCode.split('\n');
const htmlLines = html.split('\n');

console.log('NMBL lines:');
nmblLines.forEach((l, i) => {
  let offset = nmblCode.indexOf(l);
  // find correct offset for this line
  let o = 0;
  for (let j = 0; j < i; j++) o += nmblLines[j].length + 1;
  console.log(`  ${i}: [offset ${o}] "${l}"`);
});

console.log('\nHTML lines:');
htmlLines.forEach((l, i) => console.log(`  ${i}: "${l}"`));

console.log('\nClass mappings:');
mappings
  .filter(m => m.metadata?.attributeName === 'class')
  .forEach(m => {
    const text = html.substring(m.generatedSpan.start.offset, m.generatedSpan.end.offset);
    // Find which HTML line this is on
    let line = 0, col = m.generatedSpan.start.offset;
    for (const hl of htmlLines) {
      if (col <= hl.length) break;
      col -= hl.length + 1;
      line++;
    }
    console.log(`  "${text}" at HTML line ${line} col ${col} → NMBL source offset ${m.sourceSpan.start.offset}`);
  });
