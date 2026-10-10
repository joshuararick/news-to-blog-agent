import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildStoryDetailsMessage, parseBlogPostFromReplyText } from '../src/writers/blogPostPrompt.js';
import { PostWriterError } from '../src/support/errors.js';
import { VALID_POST_BODY } from './fixtures.js';

test('system prompt carries the audience and the no-invention guardrail', () => {
  const systemPrompt = buildSystemPrompt({ industry: 'HVAC', location: 'Greenville SC' });
  assert.match(systemPrompt, /HVAC business in Greenville SC/);
  assert.match(systemPrompt, /Never invent/);
  assert.match(systemPrompt, /JSON only/);
});

test('story details label missing fields as unknown', () => {
  const message = buildStoryDetailsMessage({ headline: 'Rebates', link: 'https://l', publisherName: '', publishedAt: '' });
  assert.match(message, /Headline: Rebates/);
  assert.match(message, /Publisher: unknown/);
});

test('extracts the post even with chatter around the JSON', () => {
  const post = parseBlogPostFromReplyText(`Sure! {"title": " Big news ", "body": "${VALID_POST_BODY}"} Hope that helps`);
  assert.equal(post.title, 'Big news');
});

test('rejects replies that are unusable', () => {
  const unusableReplies = [
    ['no JSON at all', 'Sorry, I cannot help'],
    ['broken JSON', '{"title": "x", body}'],
    ['missing body', '{"title": "x"}'],
    ['too short', '{"title": "x", "body": "tiny post"}'],
    ['nothing', undefined],
  ];
  for (const [label, replyText] of unusableReplies) {
    assert.throws(() => parseBlogPostFromReplyText(replyText), PostWriterError, label);
  }
});
