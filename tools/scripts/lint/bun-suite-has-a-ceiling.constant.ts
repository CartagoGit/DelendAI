/** Constants for `bun-suite-has-a-ceiling.script.ts`. */

/** A script that runs the bun test runner. */
export const BUN_TEST_PATTERN = /(^|&&\s*)bun\s+test\b/u;

/** What such a script must state, so the ceiling is a decision. */
export const REQUIRED_TIMEOUT_FLAG = '--timeout';
