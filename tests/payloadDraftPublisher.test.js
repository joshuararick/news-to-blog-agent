import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayloadDraftDocument, createPayloadDraftPublisher } from '../src/publishers/payloadDraftPublisher.js';
import { PublisherError } from '../src/support/errors.js';
import { makeFakeResponse, makeScriptedFetch } from './fixtures.js';

const POST = { title: 'Rebates are here', body: 'Body text' };
const STORY = { link: 'https://news.example/r' };
const SETTINGS = { baseUrl: 'https://site.example', apiKey: 'pk', collection: 'posts' };

test('documents are always drafts and keep the source link', () => {
  assert.deepEqual(buildPayloadDraftDocument(POST, STORY), {
    title: 'Rebates are here', summary: 'Body text', sourceUrl: 'https://news.example/r', _status: 'draft',
  });
});

test('posts to the collection with Payload API-key auth and returns the admin link', async () => {
  const { fetchImplementation, calls } = makeScriptedFetch([makeFakeResponse({ status: 201, body: { doc: { id: 42 } } })]);
  const publisher = createPayloadDraftPublisher({ ...SETTINGS, fetchImplementation });
  const result = await publisher.publish(POST, STORY);

  assert.equal(calls[0].url, 'https://site.example/api/posts');
  assert.equal(calls[0].options.headers.Authorization, 'users API-Key pk');
  assert.equal(JSON.parse(calls[0].options.body)._status, 'draft');
  assert.equal(result.location, 'https://site.example/admin/collections/posts/42');
});

test('rejections become PublisherError naming the post', async () => {
  const { fetchImplementation } = makeScriptedFetch([makeFakeResponse({ status: 403, body: 'forbidden' })]);
  const publisher = createPayloadDraftPublisher({ ...SETTINGS, fetchImplementation });
  await assert.rejects(publisher.publish(POST, STORY), error =>
    error instanceof PublisherError && /Rebates are here/.test(error.message));
});
