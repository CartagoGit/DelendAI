/**
 * agent-name-canon.constant.ts — the parts of the one shape an agent's
 * name takes.
 */

/** A version part: digits with dots, maybe a letter before (`m3.1`) or after. */
export const AGENT_NAME_VERSION_SEGMENT = /^[a-z]?\d{1,4}(\.\d+)*[a-z]?$/u;

/** A part shaped like a proposal id (`x00885`): it names work, not a model. */
export const AGENT_NAME_PROPOSAL_SEGMENT = /^[a-z]\d{5}$/u;

/** Words that name a reasoning effort or mode, never a model. */
export const AGENT_NAME_EFFORT_WORDS: readonly string[] = [
	'low',
	'medium',
	'high',
	'xhigh',
	'thinking',
	'reasoning',
];
