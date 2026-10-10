/**
 * Convert plain-text paragraphs into Lexical rich-text JSON.
 *
 * Payload's default rich-text editor (Lexical) does not store HTML or plain
 * text — it stores a JSON tree: a root node holding paragraph nodes, each
 * holding text nodes. A blog's main `content` field is almost always one of
 * these, so posts must be shaped like this to show up properly in the editor
 * and on the site.
 *
 * Only paragraphs and plain text are produced, which is all the AI writes.
 */

const LEXICAL_NODE_VERSION = 1;
const NO_FORMATTING = 0; // Lexical stores bold/italic/etc. as bit flags; 0 = plain text

/**
 * @param {string} text - One paragraph of plain text.
 * @returns {object} A Lexical paragraph node.
 */
function buildParagraphNode(text) {
  return {
    type: 'paragraph',
    version: LEXICAL_NODE_VERSION,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: NO_FORMATTING,
    children: [{
      type: 'text',
      version: LEXICAL_NODE_VERSION,
      text,
      format: NO_FORMATTING,
      style: '',
      mode: 'normal',
      detail: 0,
    }],
  };
}

/**
 * Split text on blank lines into paragraphs and wrap them in a Lexical document.
 * Single line breaks inside a paragraph become spaces, the way a browser would show them.
 *
 * @param {string} plainText
 * @returns {{ root: object }} Ready to store in a Payload `richText` field.
 */
export function convertPlainTextToLexical(plainText) {
  const paragraphs = String(plainText ?? '')
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(paragraph => paragraph !== '');

  return {
    root: {
      type: 'root',
      version: LEXICAL_NODE_VERSION,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: paragraphs.map(buildParagraphNode),
    },
  };
}
