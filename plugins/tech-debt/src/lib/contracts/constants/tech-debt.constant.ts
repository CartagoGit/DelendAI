/**
 * tech-debt.constant.ts — the bounds of a marker scan, which it reports
 * when it reaches them.
 */

/** Files read in one scan; past it the result says it was capped. */
export const TECH_DEBT_MAX_FILES = 4000;

/** A file larger than this is skipped and named. */
export const TECH_DEBT_MAX_FILE_BYTES = 512 * 1024;

/** Findings returned in one response; `total` still counts every one. */
export const TECH_DEBT_MAX_REPORTED = 200;

/** Skipped files named in one response. */
export const TECH_DEBT_MAX_SKIPPED_REPORTED = 50;
