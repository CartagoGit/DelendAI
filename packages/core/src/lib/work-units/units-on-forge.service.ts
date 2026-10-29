/**
 * units-on-forge.service.ts — every unit's work is on the forge.
 *
 * A unit's branch is pushed on every commit and at every start, so work
 * changes machine with the agent. A unit holding commits the forge lacks,
 * or edits nobody committed, is work that exists on this machine alone:
 * done again elsewhere, it is done twice and one copy is orphaned.
 */
import type { IInvariantResult } from '../contracts/interfaces/workflow-invariants.interface';
import { readGit } from './work-unit-shared.service';

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

export const unitsOnForgeInvariant = (input: {
	readonly root: string;
	readonly remote: string;
	readonly integration: string;
	/** Branch prefix of the units, without `refs/heads/`. */
	readonly workPrefix: string;
}): IInvariantResult => {
	const { root, remote, integration, workPrefix } = input;
	const units = lines(readGit(root, ['worktree', 'list', '--porcelain']))
		.join('\n')
		.split(/\n(?=worktree )/u)
		.flatMap((block) => {
			const path = /^worktree (.+)$/mu.exec(block)?.[1];
			const branch = /^branch refs\/heads\/(.+)$/mu.exec(block)?.[1];
			return path !== undefined && branch?.startsWith(workPrefix) === true
				? [{ path, branch }]
				: [];
		});
	const behind = units.flatMap(({ path, branch }) => {
		const mirror = `refs/remotes/${remote}/${branch}`;
		const known =
			readGit(root, ['rev-parse', '-q', '--verify', mirror]) !==
			undefined;
		const only = readGit(root, [
			'rev-list',
			'--count',
			`${known ? mirror : `refs/remotes/${remote}/${integration}`}..refs/heads/${branch}`,
		]);
		const dirty = lines(readGit(path, ['status', '--porcelain'])).length;
		const why = [
			...(only !== undefined && only !== '0'
				? [`${only} commit(s) only here`]
				: []),
			...(dirty > 0 ? [`${String(dirty)} uncommitted change(s)`] : []),
		];
		return why.length === 0 ? [] : [`${branch} (${why.join(', ')})`];
	});
	return {
		scope: 'checkout',
		id: 'units-on-the-forge',
		claim: "every unit's work is on the forge",
		holds: behind.length === 0,
		observed:
			behind.length === 0
				? 'all of it'
				: `${String(behind.length)}: ${behind.slice(0, 3).join(', ')}`,
		remedy: `commit in the unit, then \`git push ${remote} <branch>\`; a start of the server does both for a unit nobody is working in`,
	};
};
