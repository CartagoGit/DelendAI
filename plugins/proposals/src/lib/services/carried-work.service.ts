/**
 * carried-work.service.ts — work one agent hands in that another agent
 * made keeps its maker.
 *
 * An agent that adopted an idle unit merged its commits into a unit of its
 * own and submitted the slices: the rounds recorded it as the implementer
 * of work it never wrote, and the maker could then have approved its own
 * work as somebody else's. The commits say who made them by where they
 * were before: a work, publication or retired ref of the maker's. A
 * commit the submitter's unit holds was carried into it when it is older
 * than the unit itself and another single agent's refs hold it; work made
 * in the unit after it was entered is its own, whoever copied it since.
 * When every commit a submission brings was carried from one agent, that
 * agent is the implementer; the round still says who carried it.
 */
import { compileWorkRefParser } from '@delendai/core/public';

import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import type { IGitRunner } from '../shared/git-runner';
import { unitOfRef } from './review-claims.service';

/** The tool's own commits and claims: made where they are, never carried. */
const BOOKKEEPING = /^chore\((?:delendai|review|wip)\):/u;

/** Where a retired unit's tip is kept, mapped back to its work ref. */
const retiredAsWork = (refName: string, shape: IWorkRefShape): string => {
	const retired = refName.match(/^refs\/[^/]+\/retired\/(.+)$/u)?.[1];
	return retired === undefined
		? refName
		: `refs/heads/${shape.workRefPrefix.replace(/^refs\/heads\//u, '')}${retired}`;
};

/**
 * The agent who made the work a submission in `submitter`'s unit brings,
 * when that is one other agent; `undefined` when the work is the
 * submitter's own, mixed, or cannot be told.
 */
export const carriedFrom = async (
	run: IGitRunner,
	shape: IWorkRefShape,
	integration: string,
	submitter: string,
	/** When the submitter's unit was entered (seconds); unknown: nothing is carried. */
	enteredAt: number | undefined,
): Promise<string | undefined> => {
	if (enteredAt === undefined) return undefined;
	const listed = await run([
		'log',
		'--no-merges',
		'--format=%H%x09%ct%x09%s',
		`${integration}..HEAD`,
	]);
	if (!listed.ok) return undefined;
	const commits = listed.output
		.split('\n')
		.map((line) => line.split('\t'))
		.filter(([sha, , subject]) => sha && !BOOKKEEPING.test(subject ?? ''));
	if (commits.length === 0) return undefined;
	// Anything made in the unit after it was entered is the submitter's.
	if (commits.some(([, at]) => Number(at) >= enteredAt)) return undefined;
	const parser = compileWorkRefParser(
		shape.workRefTemplate,
		shape.workRefPrefix,
		{ requireKind: false },
	);
	if (parser === undefined) return undefined;
	const makers = new Set<string>();
	for (const [commit = ''] of commits) {
		const refs = await run([
			'for-each-ref',
			'--contains',
			commit,
			'--format=%(refname)',
			'refs/heads/',
			'refs/remotes/',
			'refs/delendai/retired/',
		]);
		if (!refs.ok) return undefined;
		const others = new Set(
			refs.output
				.split('\n')
				.filter((ref) => ref.length > 0)
				.map((ref) => unitOfRef(retiredAsWork(ref, shape), shape))
				.flatMap((unit) => {
					const agent =
						unit === undefined
							? undefined
							: parser.parse(unit)?.agent;
					return agent === undefined || agent === submitter
						? []
						: [agent];
				}),
		);
		// A commit only the submitter's refs hold is its own work.
		if (others.size !== 1) return undefined;
		for (const agent of others) makers.add(agent);
	}
	return makers.size === 1 ? [...makers][0] : undefined;
};
