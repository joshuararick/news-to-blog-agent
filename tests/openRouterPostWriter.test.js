import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenRouterRequestBody, extractBlogPostFromOpenRouterResponse, createOpenRouterPostWriter,
} from '../src/writers/openRouterPostWriter.js';
import { createPostWriter } from '../src/writers/createPostWriter.js';
import { PostWriterError } from '../src/support/errors.js';
import { VALID_POST_BODY, makeFakeResponse, makeScriptedFetch } from './fixtures.js';

const STORY = { headline: 'Rebates announced', link: 'https://news.example/r', publisherName: '', publishedAt: '' };
const SETTINGS = { industry: 'HVAC', location: 'Greenville SC', model: 'vendor/model-x' };
const makeOpenRouterResponse = content => ({ choices: [{ message: { role: 'assistant', content } }] });

test('request body uses chat-completions shape: system prompt is the first message', () => {
  const requestBody = buildOpenRouterRequestBody(STORY, SETTINGS);
  assert.equal(requestBody.model, 'vendor/model-x');
  assert.deepEqual(requestBody.messages.map(message => message.role), ['system', 'user']);
  assert.match(requestBody.messages[0].content, /Never invent/);
  assert.match(requestBody.messages[1].content, /Headline: Rebates announced/);
});

test('reads the post from choices[0].message.content', () => {
  const post = extractBlogPostFromOpenRouterResponse(
    makeOpenRouterResponse(JSON.stringify({ title: 'T', body: VALID_POST_BODY })));
  assert.equal(post.title, 'T');
});

test('an error object inside an HTTP 200 reply is reported, not ignored', () => {
  assert.throws(
    () => extractBlogPostFromOpenRouterResponse({ error: { message: 'upstream model overloaded' } }),
    error => error instanceof PostWriterError && /upstream model overloaded/.test(error.message));
  assert.throws(() => extractBlogPostFromOpenRouterResponse({ choices: [] }), PostWriterError);
});

test('writer sends a Bearer token to the OpenRouter endpoint', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([
    makeFakeResponse({ body: makeOpenRouterResponse(JSON.stringify({ title: 'T', body: VALID_POST_BODY })) }),
  ]);
  const postWriter = createOpenRouterPostWriter({ ...SETTINGS, apiKey: 'or-key', fetchImplementation });
  await postWriter.writePostAbout(STORY);

  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer or-key');
  assert.equal(JSON.parse(calls[0].options.body).model, 'vendor/model-x');
});

test('createPostWriter picks the writer named in the config', () => {
  const baseConfig = { industry: 'HVAC', location: 'Greenville SC' };
  const openRouterWriter = createPostWriter({ ...baseConfig, writer: { provider: 'openrouter', apiKey: 'k', model: 'vendor/model-x' } });
  const claudeWriter = createPostWriter({ ...baseConfig, writer: { provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-5-5' } });
  assert.equal(openRouterWriter.description, 'vendor/model-x via OpenRouter');
  assert.equal(claudeWriter.description, 'Claude (claude-haiku-5-5) via Anthropic');
});
