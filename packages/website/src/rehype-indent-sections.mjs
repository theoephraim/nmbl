// rehype plugin: wrap each heading's body in a `.md-indent` block so prose
// renders as a tree — the heading stays at its level, and everything beneath it
// (until the next same-or-higher heading) is nested one level deeper. A deeper
// heading nests again. CSS then draws a subtle guide bar down each block, which
// — because the heading is a SIBLING before the block — starts below the heading.
//
// Applies to every `:md` render, but the visual styling is scoped to `.prose`
// (guides); elsewhere `.md-indent` is `display: contents` (a no-op wrapper).

const HEADING_LEVEL = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

function headingLevel(node) {
  return node && node.type === 'element' ? (HEADING_LEVEL[node.tagName] ?? 0) : 0;
}

function sectionize(nodes) {
  const out = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    const level = headingLevel(node);
    if (!level) {
      out.push(node);
      i++;
      continue;
    }
    // Collect everything under this heading up to the next heading whose level
    // is the same or higher (a sibling/ancestor section), then recurse so deeper
    // headings nest further.
    const body = [];
    let j = i + 1;
    while (j < nodes.length) {
      const bl = headingLevel(nodes[j]);
      if (bl && bl <= level) break;
      body.push(nodes[j]);
      j++;
    }
    out.push(node);
    if (body.some((n) => n.type === 'element' || (n.type === 'text' && n.value.trim()))) {
      out.push({
        type: 'element',
        tagName: 'div',
        properties: { className: ['md-indent'] },
        children: sectionize(body),
      });
    } else {
      out.push(...body);
    }
    i = j;
  }
  return out;
}

export default function rehypeIndentSections() {
  return (tree) => {
    tree.children = sectionize(tree.children);
  };
}
