/**
 * model-catalog.constant.ts — pagination bounds for the model catalog.
 *
 * Lives here rather than beside the implementation because
 * `lint:types-in-contracts` requires exported SCREAMING_SNAKE constants to
 * sit under `contracts/constants/`, so a reader can find every declared
 * bound in one place instead of grepping the service that happens to use it.
 */

/** Page size used when a caller asks for a listing without a `limit`. */
export const DEFAULT_MODEL_CATALOG_LIMIT = 50;

/** Upper bound a caller-supplied `limit` is clamped to. */
export const MAX_MODEL_CATALOG_LIMIT = 100;
