import { describe, it, expect } from 'vitest';
import { computeNmblDiagnostics } from '../client/diagnostics';

describe('computeNmblDiagnostics', () => {
  it('reports an NMBL compile error as an error, positioned in the region', async () => {
    const d = await computeNmblDiagnostics('@each(items as (a, b))\n  span x', 'vue');
    const err = d.find((x) => /@each/.test(x.message));
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
    expect(err!.start).toBe(0); // the @each keyword
  });

  it('reports a lint error (duplicate attribute) as an error with the rule id', async () => {
    const d = await computeNmblDiagnostics('div(class="a" class="b")', 'vue');
    const err = d.find((x) => /no-duplicate-attributes/.test(x.message));
    expect(err).toBeDefined();
    expect(err!.severity).toBe('error');
  });

  it('reports a lint warning (prefer-div-shorthand) as a warning', async () => {
    const d = await computeNmblDiagnostics('div.foo\n  span hi', 'vue');
    const warn = d.find((x) => /prefer-div-shorthand/.test(x.message));
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe('warning');
  });

  it('returns nothing for a clean template', async () => {
    const d = await computeNmblDiagnostics('.foo(role="main")\n  p Hello', 'vue');
    expect(d).toEqual([]);
  });

  it('offsets are region-relative (so callers can shift by region start)', async () => {
    const src = 'div\n  div(id="a" id="b")';
    const d = await computeNmblDiagnostics(src, 'vue');
    const err = d.find((x) => /no-duplicate-attributes/.test(x.message))!;
    expect(err.start).toBeGreaterThan(0);
    expect(src.slice(err.start, err.end)).toContain('id');
  });
});
