// Expressive Code plugin: rainbow indent guides for static code samples.
// The build-time counterpart to the playground's CodeMirror indent-rainbow
// extension — same motif (depth = colour), same canonical --rainbow-* ramp, so
// the marketing samples and the live editor look identical.
//
// Rather than touch the rendered text, we paint thin vertical guides as stacked
// background gradients: one 1.5px bar per indent level, positioned at 0ch, 2ch,
// 4ch, … (NMBL's 2-space step). The bars live in the leading whitespace and
// never overlap the code.
//
// The gradients are emitted as `--ir-*` custom properties on each line; a global
// rule (.ec-line::before in global.css) paints them on a pseudo-element so its
// `opacity` dims only the guides, not the code text.

const INDENT_UNIT = 2;
const RAMP = 6;

/** Indent depth of a line, or null for a blank line. */
function depthOf(text) {
  if (!text || !text.trim()) return null;
  const leading = (text.match(/^[ \t]*/) || [''])[0].length;
  return Math.floor(leading / INDENT_UNIT);
}

/**
 * Effective guide depth for line `i`. Blank lines carry the guides that span the
 * gap — the min of the nearest non-blank lines above and below — so a level-1
 * bar stays continuous through empty lines while a deeper bar that already
 * closed doesn't reappear. A leading/trailing blank (no neighbour on one side)
 * draws nothing.
 */
function effectiveDepth(texts, i) {
  const own = depthOf(texts[i]);
  if (own !== null) return own;
  let prev = null;
  for (let k = i - 1; k >= 0; k--) { const d = depthOf(texts[k]); if (d !== null) { prev = d; break; } }
  let next = null;
  for (let k = i + 1; k < texts.length; k++) { const d = depthOf(texts[k]); if (d !== null) { next = d; break; } }
  if (prev === null || next === null) return 0;
  return Math.min(prev, next);
}

/** Build the `--ir-*` custom properties that draw `depth` guide bars, or null. */
function guideStyle(depth) {
  if (depth <= 0) return null;
  const images = [];
  const sizes = [];
  const positions = [];
  for (let i = 0; i < depth; i++) {
    const c = `var(--rainbow-${i % RAMP})`;
    images.push(`linear-gradient(${c}, ${c})`);
    sizes.push('1.5px 100%');
    positions.push(`${i * INDENT_UNIT}ch 0`);
  }
  return (
    `--ir-image:${images.join(',')};` +
    `--ir-size:${sizes.join(',')};` +
    `--ir-pos:${positions.join(',')};`
  );
}

export function pluginIndentRainbow() {
  return {
    name: 'indent-rainbow',
    hooks: {
      postprocessRenderedLine: ({ codeBlock, lineIndex, renderData }) => {
        const texts = codeBlock.getLines().map((l) => l.text);
        const style = guideStyle(effectiveDepth(texts, lineIndex));
        if (!style) return;
        const props = renderData.lineAst.properties;
        props.style = props.style ? `${props.style};${style}` : style;
      },
    },
  };
}
