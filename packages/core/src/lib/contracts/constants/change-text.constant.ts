/**
 * The fixed vocabulary of pull request and issue text (f00809): the
 * conventional-commit types, the longest summary and the section order of
 * each kind. The renderer derives every one of them; a caller supplies text.
 */

/** The conventional-commit types a title may carry. */
export const CHANGE_TEXT_TYPES = [
	'feat',
	'fix',
	'docs',
	'perf',
	'refactor',
	'test',
	'chore',
	'review',
] as const;

/** The longest summary a title carries, in characters. */
export const CHANGE_TEXT_SUMMARY_LIMIT = 72;

/** The sections of an implement, create and batch-close body, in order. */
export const CHANGE_TEXT_WORK_SECTIONS = [
	'What',
	'Why',
	'Slices shipped',
	'Files and zones',
	'Proof',
	'Review notes',
] as const;

/** The sections of a review body: Verdicts stands in for Slices shipped. */
export const CHANGE_TEXT_REVIEW_SECTIONS = [
	'What',
	'Why',
	'Verdicts',
	'Files and zones',
	'Proof',
	'Review notes',
] as const;

/** The sections of an issue body, in order. */
export const CHANGE_TEXT_ISSUE_SECTIONS = [
	'Summary',
	'Where',
	'Evidence',
	'Expected and Actual',
	'Proposal link',
] as const;

/** What a section reads when the caller supplied nothing for it. */
export const CHANGE_TEXT_EMPTY_SECTION = 'None.';

/** What the Proof section reads when nothing was proved. */
export const CHANGE_TEXT_NOT_PROVED = 'not proved locally';
