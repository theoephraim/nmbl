/** HTML void elements that have no closing tag */
export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** HTML inline elements (for whitespace-aware formatting) */
export const INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'acronym', 'b', 'bdo', 'big', 'br', 'button', 'cite',
  'code', 'dfn', 'em', 'i', 'img', 'input', 'kbd', 'label', 'map',
  'object', 'output', 'q', 'samp', 'select', 'small', 'span',
  'strong', 'sub', 'sup', 'textarea', 'time', 'tt', 'u', 'var',
]);
