/**
 * What `review` says about itself: shared by the command and by the lazy
 * entry that loads it, so its help and its flags cannot drift from it
 * (x00727, x00730). Each
 * names the command itself, where the registry's readers look for it.
 */
export const REVIEW_COMMAND = {
	summary:
		'Review proposals in four commands: next (your unit and the next proposal, claimed), approve, changes, finish.',
	usage: 'review <next|approve|changes|release|finish> [<proposalId> <sliceId>] --agent=<you> [--session=<s>] [--note=<why>] [--commit=<sha> --validate-exit=<n> --tests-passing=<n> --tests-total=<n> --criterion="<criterion> => <evidence>" …]',
	flags: [
		'agent',
		'session',
		'note',
		'commit',
		'validate-exit',
		'tests-passing',
		'tests-total',
		'criterion',
	],
} as const;

/** What separates a criterion from the evidence a reviewer gives for it. */
export const CRITERION_SEPARATOR = ' => ';
