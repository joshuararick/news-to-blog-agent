import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeRequestBody, extractBlogPostFromClaudeResponse, createClaudePostWriter,
} from '../src/writers/claudePostWriter.js';
import { PostWriterError } from '../src/support/errors.js';
import { VALID_POST_BODY, makeClaudeResponse, makeFakeResponse, makeScriptedFetch } from './fixtures.js';

const STORY = { headline: 'Rebates announced', link: 'https://news.example/r', publisherName: '', publishedAt: '' };
const SETTINGS = { industry: 'HVAC', location: 'Greenville SC', model: 'claude-haiku-5-5' };

test('request body uses Anthropic shape: separate system field, one user message', () => {
  const requestBody = buildClaudeRequestBody(STORY, SETTINGS);
  assert.equal(requestBody.model, 'claude-haiku-5-5');
  assert.match(requestBody.system, /Never invent/);
  assert.equal(requestBody.messages.length, 1);
  assert.match(requestBody.messages[0].content, /Headline: Rebates announced/);
  assert.match(requestBody.messages[0].content, /Publisher: unknown/);
});

test('extracts the post even with chatter around the JSON', () => {
  const post = extractBlogPostFromClaudeResponse(
    makeClaudeResponse(`Sure! {"title": " Big news ", "body": "${VALID_POST_BODY}"} Hope that helps`));
  assert.equal(post.title, 'Big news');
});

test('an empty Anthropic response is rejected', () => {
  assert.throws(() => extractBlogPostFromClaudeResponse({}), PostWriterError);
});

test('writer sends the API key and version headers', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([
    makeFakeResponse({ body: makeClaudeResponse(JSON.stringify({ title: 'T', body: VALID_POST_BODY })) }),
  ]);
  const postWriter = createClaudePostWriter({ ...SETTINGS, apiKey: 'sk-test', fetchImplementation });
  const post = await postWriter.writePostAbout(STORY);

  assert.equal(post.title, 'T');
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].options.headers['x-api-key'], 'sk-test');
  assert.equal(calls[0].options.headers['anthropic-version'], '2023-06-01');
});
