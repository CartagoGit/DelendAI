/**
 * agent-name-canon.constant.ts — the parts of the one shape an agent's
 * name takes.
 */

/** A version part: digits with dots, maybe a letter before (`m3.1`) or after. */
export const AGENT_NAME_VERSION_SEGMENT = /^[a-z]?\d+(\.\d+)*[a-z]?$/u;

/** Words that name a reasoning effort or mode, never a model. */
export const AGENT_NAME_EFFORT_WORDS: readonly string[] = [
	'low',
	'medium',
	'high',
	'xhigh',
	'thinking',
	'reasoning',
];
