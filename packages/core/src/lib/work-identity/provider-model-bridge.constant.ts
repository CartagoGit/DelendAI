/**
 * provider-model-bridge.constant.ts — where a chat provider publishes the
 * model it observed serving a conversation, and for how long that
 * observation still counts.
 */

/** Where a provider writes the model it serves, unless overridden. */
export const PROVIDER_MODEL_BRIDGE_VARIABLE = 'DELENDAI_PROVIDER_MODEL_FILE';

/** The bridge's default file, under the user cache of the provider host. */
export const PROVIDER_MODEL_BRIDGE_FILE = 'provider-model.json';

/**
 * How old a bridge entry may be and still name the model at work. Chat
 * turns are seconds apart; a window in minutes keeps a crashed session's
 * last entry from attributing new work to a model that stopped serving.
 */
export const PROVIDER_MODEL_MAX_AGE_MS = 15 * 60 * 1000;
