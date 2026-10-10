import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeRequestBody, buildSystemPrompt, extractBlogPostFromClaudeResponse, createClaudePostWriter,
} from '../src/writers/claudePostWriter.js';
import { PostWriterError } from '../src/support/errors.js';
import { VALID_POST_BODY, makeClaudeResponse, makeFakeResponse, makeScriptedFetch } from './fixtures.js';

const STORY = { headline: 'Rebates announced', link: 'https://news.example/r', publisherName: '', publishedAt: '' };
const SETTINGS = { industry: 'HVAC', location: 'Greenville SC', model: 'claude-haiku-5-5' };

test('system prompt carries the no-invention guardrail and audience', () => {
  const systemPrompt = buildSystemPrompt(SETTINGS);
  assert.match(systemPrompt, /HVAC business in Greenville SC/);
  assert.match(systemPrompt, /Never invent/);
  assert.match(systemPrompt, /JSON only/);
});

test('request body includes model and story details, with unknowns labelled', () => {
  const requestBody = buildClaudeRequestBody(STORY, SETTINGS);
  assert.equal(requestBody.model, 'claude-haiku-5-5');
  assert.match(requestBody.messages[0].content, /Headline: Rebates announced/);
  assert.match(requestBody.messages[0].content, /Publisher: unknown/);
});

test('extracts the post even with chatter around the JSON', () => {
  const post = extractBlogPostFromClaudeResponse(
    makeClaudeResponse(`Sure! {"title": " Big news ", "body": "${VALID_POST_BODY}"} Hope that helps`));
  assert.equal(post.title, 'Big news');
});

test('rejects replies that are unusable', () => {
  const cases = [
    ['no JSON at all', makeClaudeResponse('Sorry, I cannot help')],
    ['broken JSON', makeClaudeResponse('{"title": "x", body}')],
    ['missing body', makeClaudeResponse('{"title": "x"}')],
    ['too short', makeClaudeResponse('{"title": "x", "body": "tiny post"}')],
    ['empty response', {}],
  ];
  for (const [label, response] of cases) {
    assert.throws(() => extractBlogPostFromClaudeResponse(response), PostWriterError, label);
  }
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
