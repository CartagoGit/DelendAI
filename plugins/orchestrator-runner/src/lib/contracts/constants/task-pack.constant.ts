/**
 * task-pack.constant.ts — how a hop's budget is derived from the target model.
 */

/** The share of a model's context window a hop's input may take; the rest is its answer and its own reading. */
export const HOP_CONTEXT_WINDOW_SHARE = 0.5;

/** The estimate every delendai budget uses: four bytes to a token. */
export const HOP_BYTES_PER_TOKEN = 4;
