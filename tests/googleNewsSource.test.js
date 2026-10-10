import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleNewsFeedUrl, parseRssFeed, createGoogleNewsSource } from '../src/sources/googleNewsSource.js';
import { NewsSourceError } from '../src/support/errors.js';
import { SAMPLE_RSS_FEED, makeFakeResponse, makeScriptedFetch } from './fixtures.js';

test('feed URL searches industry + location within the lookback window', () => {
  const feedUrl = new URL(buildGoogleNewsFeedUrl({ industry: 'HVAC', location: 'Greenville SC', lookbackDays: 7 }));
  assert.equal(feedUrl.host, 'news.google.com');
  assert.equal(feedUrl.searchParams.get('q'), 'HVAC Greenville SC when:7d');
});

test('parses stories, unwraps CDATA, decodes entities, skips untitled items', () => {
  const stories = parseRssFeed(SAMPLE_RSS_FEED);
  assert.equal(stories.length, 2);
  assert.deepEqual(stories[0], {
    headline: 'Greenville announces new HVAC efficiency rebates',
    link: 'https://news.example/rebates',
    publisherName: 'The Greenville News',
    publishedAt: 'Thu, 09 Oct 2026 12:00:00 GMT',
  });
  assert.equal(stories[1].headline, 'Heat pump installs rise & costs fall');
  assert.equal(stories[1].publisherName, '');
});

test('garbage input yields no stories rather than a crash', () => {
  assert.deepEqual(parseRssFeed('<html>not a feed</html>'), []);
  assert.deepEqual(parseRssFeed(undefined), []);
});

test('source wraps failures in NewsSourceError', async () => {
  const { fetchImplementation } = makeScriptedFetch([makeFakeResponse({ status: 404 })]);
  const newsSource = createGoogleNewsSource({ fetchImplementation });
  await assert.rejects(
    newsSource.findRecentStories({ industry: 'HVAC', location: 'X', lookbackDays: 7 }),
    NewsSourceError,
  );
});
