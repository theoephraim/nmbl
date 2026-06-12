import { describe, test, expect } from 'vitest';
import { compile } from '../src/index.js';

describe('Vue slot shorthand', () => {
  test('compiles #slotName correctly', () => {
    const input = `
div
  ItemCard
    template(#actions)
      Button Click me
    template(#footer)
      span Footer content
`;
    const { html, errors } = compile(input);
    expect(errors).toHaveLength(0);
    expect(html).toContain('<template #actions>');
    expect(html).toContain('<template #footer>');
    expect(html).toContain('<Button>Click me</Button>');
    expect(html).toContain('<span>Footer content</span>');
  });

  test('compiles #slotName with slot props', () => {
    const input = `
ul
  li(v-for="item in items")
    ItemCard
      template(#default="{ data }")
        span {{ data.name }}
`;
    const { html, errors } = compile(input);
    expect(errors).toHaveLength(0);
    expect(html).toContain('<template #default="{ data }">');
    expect(html).toContain('<span>{{ data.name }}</span>');
  });

  test('preserves v-slot syntax', () => {
    const input = `
div
  ItemCard
    template(v-slot:header)
      h1 Header
`;
    const { html, errors } = compile(input);
    expect(errors).toHaveLength(0);
    expect(html).toContain('<template v-slot:header>');
    expect(html).toContain('<h1>Header</h1>');
  });
});