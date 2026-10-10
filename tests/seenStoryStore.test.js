import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSeenStoryStore, MAXIMUM_REMEMBERED_LINKS } from '../src/state/seenStoryStore.js';

const makeTemporaryFilePath = async () => join(await mkdtemp(join(tmpdir(), 'seen-')), 'seen.json');

test('starts empty when the file does not exist, then remembers across reopen', async () => {
  const filePath = await makeTemporaryFilePath();
  const firstRun = await openSeenStoryStore(filePath);
  assert.equal(firstRun.hasSeen('https://a'), false);
  firstRun.remember('https://a');
  await firstRun.save();

  const secondRun = await openSeenStoryStore(filePath);
  assert.equal(secondRun.hasSeen('https://a'), true);
});

test('keeps only the newest links', async () => {
  const filePath = await makeTemporaryFilePath();
  const store = await openSeenStoryStore(filePath);
  for (let index = 0; index <= MAXIMUM_REMEMBERED_LINKS; index++) store.remember(`https://link/${index}`);
  await store.save();

  const savedLinks = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(savedLinks.length, MAXIMUM_REMEMBERED_LINKS);
  assert.equal(savedLinks.includes('https://link/0'), false, 'oldest dropped');
});

test('a corrupted file fails loudly instead of re-posting everything', async () => {
  const filePath = await makeTemporaryFilePath();
  await writeFile(filePath, '{not json');
  await assert.rejects(openSeenStoryStore(filePath), /unreadable/);
});
