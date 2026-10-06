/**
 * retired-landed.service.ts — retired work the integration branch came
 * to hold is dropped from the forge, not listed for ever.
 *
 * A unit is retired because it will not land as it is. Its work often
 * lands all the same: finished by another agent, carried by another pull
 * request, merged a minute after it was given up. From then on the kept
 * tip keeps nothing, and a third of the retired list was that.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ILandedRetired } from '../contracts/interfaces/work-retire.interface';
import { integrationBase, readGit } from './work-unit-shared.service';
import { namespacedRef } from './namespaced-ref.helper';

/**
 * The retired refs of `remote` whose commit the integration branch
 * contains, dropped when `apply`. A forge that cannot be reached, or a
 * commit that cannot be read, drops nothing.
 */
export const reapLandedRetired = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly apply: boolean;
}): readonly ILandedRetired[] => {
	const { root, remote } = input;
	const prefix = `${namespacedRef(input.policy.branches.namespacePrefix, 'retired')}/`;
	const listed = readGit(root, ['ls-remote', remote, `${prefix}*`]);
	if (listed === undefined || listed.length === 0) return [];
	const retired = listed
		.split('\n')
		.map((line) => {
			const [commit = '', ref = ''] = line.split('\t');
			return { unit: ref.slice(prefix.length), ref, commit };
		})
		.filter((each) => each.ref.startsWith(prefix));
	const base = integrationBase(root, input.policy);
	if (base === undefined) return [];
	const unknown = retired.filter(
		(each) =>
			readGit(root, ['cat-file', '-e', `${each.commit}^{commit}`]) ===
			undefined,
	);
	// By commit, into no ref: the clone keeps no copy of retired work.
	if (unknown.length > 0) {
		readGit(root, [
			'fetch',
			'--quiet',
			'--no-tags',
			remote,
			...unknown.map((each) => each.commit),
		]);
	}
	const landed = retired.filter(
		(each) =>
			readGit(root, [
				'merge-base',
				'--is-ancestor',
				each.commit,
				base,
			]) !== undefined,
	);
	if (landed.length === 0) return [];
	if (!input.apply) {
		return landed.map((each) => ({ ...each, outcome: 'would-drop' }));
	}
	const pushed = readGit(root, [
		'push',
		'--quiet',
		remote,
		...landed.map((each) => `:${each.ref}`),
	]);
	return landed.map((each) => ({
		...each,
		outcome: pushed === undefined ? 'kept' : 'dropped',
	}));
};
