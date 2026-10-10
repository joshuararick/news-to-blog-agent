/**
 * Minimal structured logger.
 *
 * Every line starts with a timestamp and level so cron / CI logs are easy to
 * scan. Swap in any object with the same four methods (e.g. pino) if needed.
 */

/** @typedef {{ debug: Function, info: Function, warn: Function, error: Function }} Logger */

/**
 * @param {object} [options]
 * @param {boolean} [options.verbose=false] - When false, debug lines are hidden.
 * @param {Pick<Console, 'log' | 'error'>} [options.output=console]
 * @returns {Logger}
 */
export function createConsoleLogger({ verbose = false, output = console } = {}) {
  const timestamp = () => new Date().toISOString();

  return {
    debug: message => { if (verbose) output.log(`${timestamp()} DEBUG ${message}`); },
    info: message => output.log(`${timestamp()} INFO  ${message}`),
    warn: message => output.error(`${timestamp()} WARN  ${message}`),
    error: message => output.error(`${timestamp()} ERROR ${message}`),
  };
}

/** A logger that discards everything — handy in tests. */
export const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };
