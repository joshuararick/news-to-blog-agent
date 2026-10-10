/**
 * The pipeline: SOURCE → filter → TRANSFORM → SINK.
 *
 * This file only *orchestrates*. It does not know about Google, Claude or
 * Payload — it receives objects that can find stories, write posts and
 * publish them (dependency injection). That is why it can be tested with
 * fakes, and why swapping Payload for WordPress means writing one new
 * publisher, not touching this file.
 *
 * One story failing (e.g. Claude returns a bad reply) never stops the others;
 * failures are collected into the run summary instead.
 */

/**
 * @typedef {object} RunSummary
 * @property {number} storiesFound - Stories returned by the news source.
 * @property {number} storiesAlreadyPosted - Skipped because they were posted on an earlier run.
 * @property {{ headline: string, title: string, location: string }[]} postsPublished
 * @property {{ headline: string, stage: string, reason: string }[]} postsFailed
 */

/**
 * Run the pipeline once.
 *
 * @param {object} dependencies
 * @param {import('./config.js').PipelineConfig} dependencies.config
 * @param {{ findRecentStories: Function }} dependencies.newsSource
 * @param {{ writePostAbout: Function, description: string }} dependencies.postWriter
 * @param {{ publish: Function, description: string }} dependencies.publisher
 * @param {{ hasSeen: Function, remember: Function, save: Function }} dependencies.seenStoryStore
 * @param {import('./support/logger.js').Logger} dependencies.logger
 * @returns {Promise<RunSummary>}
 */
export async function runNewsToBlogPipeline({ config, newsSource, postWriter, publisher, seenStoryStore, logger }) {
  logger.debug(`Writer: ${postWriter.description ?? 'custom'} · Publisher: ${publisher.description}`);

  // 1. SOURCE — find recent stories.
  logger.info(`Looking for ${config.industry} news in ${config.location} from the last ${config.newsLookbackDays} days`);
  const foundStories = await newsSource.findRecentStories({
    industry: config.industry,
    location: config.location,
    lookbackDays: config.newsLookbackDays,
  });

  // 2. FILTER — drop anything already posted, then keep the first N.
  const unpostedStories = foundStories.filter(story => !seenStoryStore.hasSeen(story.link));
  const storiesToWrite = unpostedStories.slice(0, config.maximumPostsPerRun);
  logger.info(`Found ${foundStories.length} stories, ${unpostedStories.length} new; writing ${storiesToWrite.length}`);

  const summary = {
    storiesFound: foundStories.length,
    storiesAlreadyPosted: foundStories.length - unpostedStories.length,
    postsPublished: [],
    postsFailed: [],
  };

  // 3 + 4. TRANSFORM and SINK — one story at a time, so failures stay isolated.
  for (const story of storiesToWrite) {
    try {
      logger.debug(`Writing post for: ${story.headline}`);
      const post = await postWriter.writePostAbout(story);

      const { location } = await publisher.publish(post, story);
      if (!config.isDryRun) seenStoryStore.remember(story.link);

      summary.postsPublished.push({ headline: story.headline, title: post.title, location });
      logger.info(`✔ "${post.title}" → ${location}`);
    } catch (error) {
      summary.postsFailed.push({ headline: story.headline, stage: error.stage ?? 'unknown', reason: error.message });
      logger.warn(`✘ Skipped "${story.headline}" (${error.stage ?? 'unknown'}): ${error.message}`);
    }
  }

  // Dry runs leave no trace, so the same stories can be previewed again.
  if (!config.isDryRun) await seenStoryStore.save();

  logger.info(`Done: ${summary.postsPublished.length} saved to ${publisher.description}, ${summary.postsFailed.length} failed`);
  return summary;
}
