export type IRulesMode = 'strict' | 'mixed' | 'none' | 'proposal';

export const RULES_MODES: readonly IRulesMode[] = [
	'strict',
	'mixed',
	'none',
	'proposal',
];

export const RULES_MODE_GUIDANCE: Readonly<Record<IRulesMode, string>> = {
	strict: 'Actively bring code into full compliance: run the fixer and make manual edits until check_rules is clean.',
	mixed: 'Only fix/align files you create or touch; leave untouched files as-is.',
	none: 'Never auto-change code. Report violations only; let the human decide.',
	proposal:
		'Do not edit directly. Create proposals (proposals plugin) describing the changes needed to comply.',
};
