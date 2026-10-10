/**
 * SINK stage (dry run): print posts to the terminal instead of saving them.
 * Lets you preview Claude's writing before connecting a real website.
 */

/**
 * @param {object} [options]
 * @param {Pick<Console, 'log'>} [options.output=console]
 */
export function createConsolePublisher({ output = console } = {}) {
  return {
    description: 'the terminal (dry run — nothing is saved)',

    async publish(post, story) {
      const divider = '─'.repeat(60);
      output.log(`\n${divider}\n${post.title}\n${divider}\n${post.body}\n\nSource: ${story.link}\n`);
      return { location: 'terminal' };
    },
  };
}
