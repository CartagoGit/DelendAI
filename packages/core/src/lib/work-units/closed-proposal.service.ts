/**
 * closed-proposal.service.ts — an implement unit is entered only for work
 * that is still open.
 *
 * On 2026-10-28 an agent entered `implement/x00722-S1-g1` although x00722
 * was in `done/`, and committed there a change that had nothing to do
 * with it. Nothing refused a unit on a closed proposal: the change went
 * unseen by review, under the name of finished work.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import { scalarArg } from './command-args.helper';
import { readWorkspaceDocsDir } from './development-policy.service';
import {
	integratedDocumentPathOf,
	sliceSectionOf,
} from './reviewed-proposal.service';
import { integrationBase, readGit, refused } from './work-unit-shared.service';

const DONE_STATUS = /^\s*-\s*\*\*Status\*\*:\s*done\b/mu;

/** What is closed about `slice` of a proposal at `path`, or nothing. */
export const closedState = (
	path: string,
	document: string,
	slice: string | undefined,
): string | undefined => {
	if (path.split('/').includes('done')) return 'the proposal is in done/';
	if (slice === undefined || slice === 'all') return undefined;
	return DONE_STATUS.test(sliceSectionOf(document, slice))
		? `slice ${slice} is done`
		: undefined;
};

/**
 * The refusal an agent gets for implementing closed work, or `undefined`:
 * other kinds of unit, and open work, go in.
 */
export const closedForImplementing = async (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	args: readonly string[],
	proposal: string,
): Promise<IWorkUnitResult | undefined> => {
	if ((scalarArg(args, 'kind') ?? 'implement') !== 'implement') {
		return undefined;
	}
	const base = integrationBase(root, policy);
	if (base === undefined) return undefined;
	const path = integratedDocumentPathOf({
		root,
		base,
		docsDir: await readWorkspaceDocsDir(root),
		proposal,
	});
	if (path === undefined) return undefined;
	const closed = closedState(
		path,
		readGit(root, ['show', `${base}:${path}`]) ?? '',
		scalarArg(args, 'slice'),
	);
	return closed === undefined
		? undefined
		: refused(
				`${proposal} is closed for implementing: ${closed}.`,
				`A change to finished work is a new proposal: \`delendai work enter --proposal=new --slice=all --kind=create\`, then \`delendai proposals create --kind=fix --title=<what> --goal=<why>\` in its worktree.`,
			);
};
