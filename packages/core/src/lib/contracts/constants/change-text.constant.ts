import type { IChangeType } from '../interfaces/change-text.interface';

/** The longest summary a title carries. */
export const SUMMARY_MAX_LENGTH = 72;

/** The conventional type a proposal kind is delivered as. */
export const CHANGE_TYPE_BY_PROPOSAL_KIND: Readonly<
	Record<string, IChangeType>
> = {
	feat: 'feat',
	breaking: 'feat',
	fix: 'fix',
	repair: 'fix',
	refactor: 'refactor',
	perf: 'perf',
	test: 'test',
	docs: 'docs',
	audit: 'docs',
	plan: 'docs',
	chore: 'chore',
	infra: 'chore',
	spike: 'chore',
	legacy: 'chore',
	resume: 'chore',
};
