/**
 * link-check.constant.ts — what the link scan reads, and the bounds it
 * reports when it reaches them.
 */

/** Markdown and MDX documents; the links of both are checked. */
export const LINK_CHECK_DOC_GLOB = '**/*.{md,mdx}';

/** Documents read in one scan; past it the result says it was capped. */
export const LINK_CHECK_MAX_DOCS = 5000;

/** A document larger than this is skipped and named. */
export const LINK_CHECK_MAX_DOC_BYTES = 1024 * 1024;

/** Findings returned in one response; `total` still counts every one. */
export const LINK_CHECK_MAX_REPORTED = 200;

/** Skipped documents named in one response. */
export const LINK_CHECK_MAX_SKIPPED_REPORTED = 50;
