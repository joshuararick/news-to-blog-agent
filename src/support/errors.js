/**
 * Error types for the news-to-blog pipeline.
 *
 * Each stage throws its own error class so that logs and the run summary can
 * say exactly *where* something went wrong ("the CMS rejected the draft")
 * instead of a generic "something failed".
 */

/** Base class: every pipeline error carries the name of the stage that raised it. */
export class PipelineError extends Error {
  /**
   * @param {string} message - Human-readable description of what went wrong.
   * @param {object} [options]
   * @param {string} [options.stage] - Pipeline stage that raised the error.
   * @param {unknown} [options.cause] - Underlying error, if any.
   */
  constructor(message, { stage = 'pipeline', cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.stage = stage;
  }
}

/** Configuration is missing or invalid. Raised before any network call happens. */
export class ConfigurationError extends PipelineError {
  constructor(message) {
    super(message, { stage: 'configuration' });
  }
}

/** The news source could not be reached or returned something unreadable. */
export class NewsSourceError extends PipelineError {
  constructor(message, cause) {
    super(message, { stage: 'news-source', cause });
  }
}

/** Claude could not produce a usable blog post. */
export class PostWriterError extends PipelineError {
  constructor(message, cause) {
    super(message, { stage: 'post-writer', cause });
  }
}

/** The CMS refused or failed to store the draft. */
export class PublisherError extends PipelineError {
  constructor(message, cause) {
    super(message, { stage: 'publisher', cause });
  }
}

/** An HTTP request kept failing after every retry. */
export class HttpRequestError extends PipelineError {
  /**
   * @param {string} message
   * @param {object} details
   * @param {number|null} details.status - HTTP status, or null for network failures.
   * @param {string} details.responseBody - Response text (truncated) for debugging.
   * @param {unknown} [details.cause]
   */
  constructor(message, { status, responseBody, cause }) {
    super(message, { stage: 'http', cause });
    this.status = status;
    this.responseBody = responseBody;
  }
}
