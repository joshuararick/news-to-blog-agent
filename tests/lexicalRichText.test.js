import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertPlainTextToLexical } from '../src/publishers/lexicalRichText.js';

test('each blank-line-separated block becomes one paragraph node', () => {
  const document = convertPlainTextToLexical('First paragraph.\n\nSecond paragraph.');
  assert.equal(document.root.type, 'root');
  assert.deepEqual(
    document.root.children.map(paragraph => paragraph.children[0].text),
    ['First paragraph.', 'Second paragraph.'],
  );
});

test('nodes carry the fields Lexical requires', () => {
  const [paragraph] = convertPlainTextToLexical('Hello').root.children;
  assert.equal(paragraph.type, 'paragraph');
  assert.equal(paragraph.version, 1);
  const [textNode] = paragraph.children;
  assert.deepEqual(
    { type: textNode.type, format: textNode.format, mode: textNode.mode, version: textNode.version },
    { type: 'text', format: 0, mode: 'normal', version: 1 },
  );
});

test('single line breaks join, extra blank lines and whitespace are ignored', () => {
  const document = convertPlainTextToLexical('  Line one\nline two  \n\n\n\nThird\n\n   ');
  assert.deepEqual(
    document.root.children.map(paragraph => paragraph.children[0].text),
    ['Line one line two', 'Third'],
  );
});

test('empty input gives an empty but valid document', () => {
  assert.deepEqual(convertPlainTextToLexical('').root.children, []);
  assert.deepEqual(convertPlainTextToLexical(undefined).root.children, []);
});

test('the result survives a JSON round trip unchanged (what Payload receives)', () => {
  const document = convertPlainTextToLexical('A "quoted" word & symbols <b>');
  assert.deepEqual(JSON.parse(JSON.stringify(document)), document);
  assert.equal(document.root.children[0].children[0].text, 'A "quoted" word & symbols <b>');
});
