/**
 * Memory between runs: which story links have already become posts.
 *
 * Stored as a small JSON array on disk. Without this, a story that stays in
 * the news for three days would be written up three times.
 */

import { readFile, writeFile, rename } from 'node:fs/promises';

/** Keep the file from growing forever; old links fall out of the news anyway. */
export const MAXIMUM_REMEMBERED_LINKS = 1000;

/**
 * @param {string} filePath
 * @returns {Promise<{ hasSeen: (link: string) => boolean, remember: (link: string) => void, save: () => Promise<void> }>}
 */
export async function openSeenStoryStore(filePath) {
  const rememberedLinks = new Set(await readRememberedLinks(filePath));

  return {
    hasSeen: link => rememberedLinks.has(link),

    remember: link => {
      rememberedLinks.delete(link); // re-insert so it counts as most recent
      rememberedLinks.add(link);
    },

    async save() {
      const newestLinks = [...rememberedLinks].slice(-MAXIMUM_REMEMBERED_LINKS);
      // Write to a temp file, then rename: a crash mid-write can't corrupt the real file.
      const temporaryFilePath = `${filePath}.tmp`;
      await writeFile(temporaryFilePath, JSON.stringify(newestLinks, null, 2));
      await rename(temporaryFilePath, filePath);
    },
  };
}

/** @param {string} filePath @returns {Promise<string[]>} */
async function readRememberedLinks(filePath) {
  try {
    const fileContents = JSON.parse(await readFile(filePath, 'utf8'));
    return Array.isArray(fileContents) ? fileContents.filter(link => typeof link === 'string') : [];
  } catch (error) {
    if (error.code === 'ENOENT') return []; // first run: nothing remembered yet
    throw new Error(`Seen-stories file ${filePath} is unreadable (${error.message}). Fix or delete it.`);
  }
}
