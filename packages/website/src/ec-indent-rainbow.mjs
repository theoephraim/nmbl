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
      postprocessRenderedLine: ({ line, renderData }) => {
        const leading = (line.text.match(/^[ \t]*/) || [''])[0].length;
        const style = guideStyle(Math.floor(leading / INDENT_UNIT));
        if (!style) return;
        const props = renderData.lineAst.properties;
        props.style = props.style ? `${props.style};${style}` : style;
      },
    },
  };
}
