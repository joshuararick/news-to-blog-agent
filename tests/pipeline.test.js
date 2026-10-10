import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNewsToBlogPipeline } from '../src/pipeline.js';
import { PostWriterError } from '../src/support/errors.js';
import { silentLogger } from '../src/support/logger.js';

const story = (id) => ({ headline: `Story ${id}`, link: `https://news.example/${id}`, publisherName: '', publishedAt: '' });

/** Build a pipeline with in-memory fakes; override any piece per test. */
function buildFakePipeline({ stories, alreadySeenLinks = [], isDryRun = false, failingHeadlines = [] }) {
  const rememberedLinks = new Set(alreadySeenLinks);
  const publishedTitles = [];
  let saveCount = 0;

  const dependencies = {
    config: { industry: 'HVAC', location: 'Greenville SC', newsLookbackDays: 7, maximumPostsPerRun: 2, isDryRun },
    newsSource: { findRecentStories: async () => stories },
    postWriter: {
      writePostAbout: async s => {
        if (failingHeadlines.includes(s.headline)) throw new PostWriterError('Claude reply is missing a title or body');
        return { title: `Post about ${s.headline}`, body: '...' };
      },
    },
    publisher: {
      description: 'fake CMS',
      publish: async post => { publishedTitles.push(post.title); return { location: `cms/${publishedTitles.length}` }; },
    },
    seenStoryStore: {
      hasSeen: link => rememberedLinks.has(link),
      remember: link => rememberedLinks.add(link),
      save: async () => { saveCount++; },
    },
    logger: silentLogger,
  };
  return { dependencies, publishedTitles, rememberedLinks, getSaveCount: () => saveCount };
}

test('happy path: skips seen stories, respects the per-run limit, remembers what it posted', async () => {
  const fake = buildFakePipeline({
    stories: [story(1), story(2), story(3), story(4)],
    alreadySeenLinks: ['https://news.example/1'],
  });
  const summary = await runNewsToBlogPipeline(fake.dependencies);

  assert.equal(summary.storiesFound, 4);
  assert.equal(summary.storiesAlreadyPosted, 1);
  assert.deepEqual(fake.publishedTitles, ['Post about Story 2', 'Post about Story 3'], 'limit of 2, oldest-seen skipped');
  assert.equal(fake.rememberedLinks.has('https://news.example/3'), true);
  assert.equal(fake.rememberedLinks.has('https://news.example/4'), false, 'not written, so not remembered');
  assert.equal(fake.getSaveCount(), 1);
});

test('one failing story does not stop the next, and is not remembered (so it retries tomorrow)', async () => {
  const fake = buildFakePipeline({ stories: [story(1), story(2)], failingHeadlines: ['Story 1'] });
  const summary = await runNewsToBlogPipeline(fake.dependencies);

  assert.deepEqual(summary.postsFailed, [{ headline: 'Story 1', stage: 'post-writer', reason: 'Claude reply is missing a title or body' }]);
  assert.equal(summary.postsPublished.length, 1);
  assert.equal(fake.rememberedLinks.has('https://news.example/1'), false);
});

test('dry run leaves no memory behind', async () => {
  const fake = buildFakePipeline({ stories: [story(1)], isDryRun: true });
  await runNewsToBlogPipeline(fake.dependencies);
  assert.equal(fake.rememberedLinks.size, 0);
  assert.equal(fake.getSaveCount(), 0);
});

test('no news is a normal, quiet outcome', async () => {
  const fake = buildFakePipeline({ stories: [] });
  const summary = await runNewsToBlogPipeline(fake.dependencies);
  assert.deepEqual([summary.postsPublished.length, summary.postsFailed.length], [0, 0]);
});
