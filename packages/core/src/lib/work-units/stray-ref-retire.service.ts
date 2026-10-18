/**
 * stray-ref-retire.service.ts — a ref that is nobody's is retired like a
 * unit: its tip is kept on the forge, then the ref goes.
 *
 * `no-stray-refs` names refs outside every namespace a clone holds, and
 * its remedy is `work retire`. Retiring took only work and publication
 * branches, so the one command the remedy names refused the refs it was
 * about ("is not a unit of work"), and a tip only this clone had could be
 * kept only by hand-made git.
 */
import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IWorkUnitResult } from '../contracts/interfaces/work-unit-context.interface';
import type { IRetirementOutcome } from '../contracts/interfaces/work-retire.interface';
import { namespacedRef } from './namespaced-ref.helper';
import { heldByForge } from './stray-refs-reap.service';
import { strayRefs } from './stray-refs.service';
import { restoreAdvice } from './work-retire.service';
import { integrationBase, readGit, refused } from './work-unit-shared.service';

/** How much of a commit names a kept stray tip. */
const SHORT_COMMIT_LENGTH = 12;

const lines = (text: string | undefined): readonly string[] =>
	(text ?? '').split('\n').filter((line) => line.length > 0);

/** The retired ref a stray's tip is kept under, for `agent`. */
export const strayRetiredRef = (input: {
	readonly namespace: string;
	readonly agent: string;
	readonly ref: string;
	readonly commit: string;
}): string =>
	namespacedRef(
		input.namespace,
		'retired',
		`${input.agent}/stray/${input.ref.replace(/^refs\//u, '')}-${input.commit.slice(0, SHORT_COMMIT_LENGTH)}`,
	);

/**
 * Retire `ref` when it is one `no-stray-refs` names; `undefined` when it
 * is not, for the caller to refuse. A tip the integration branch or the
 * forge already holds needs no keeping; any other is pushed under the
 * retired namespace first, and the ref is removed only once it is there.
 */
export const retireStrayRef = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly ref: string;
	readonly reason: string;
	readonly agent: string;
}): IWorkUnitResult | undefined => {
	const { root, policy, remote, reason } = input;
	const ref = input.ref.startsWith('refs/') ? input.ref : `refs/${input.ref}`;
	const stray = strayRefs({
		refs: lines(readGit(root, ['for-each-ref', '--format=%(refname)'])),
		remotes: lines(readGit(root, ['remote'])),
		namespace: policy.branches.namespacePrefix,
	});
	if (!stray.includes(ref)) return undefined;
	const commit = readGit(root, [
		'rev-parse',
		'-q',
		'--verify',
		`${ref}^{commit}`,
	]);
	if (commit === undefined || commit.length === 0) return undefined;
	const base = integrationBase(root, policy);
	const delivered =
		base !== undefined &&
		readGit(root, ['merge-base', '--is-ancestor', commit, base]) !==
			undefined;
	const forgeTips = (): ReadonlySet<string> =>
		new Set(
			lines(readGit(root, ['ls-remote', '--', remote])).map(
				(line) => line.split('\t')[0] ?? '',
			),
		);
	const kept =
		delivered || heldByForge(root, ref, remote, forgeTips)
			? []
			: [
					{
						ref: strayRetiredRef({
							namespace: policy.branches.namespacePrefix,
							agent: input.agent,
							ref,
							commit,
						}),
						commit,
					},
				];
	for (const each of kept) {
		const pushed =
			readGit(root, ['update-ref', each.ref, each.commit]) !==
				undefined &&
			readGit(root, [
				'push',
				'--quiet',
				'--',
				remote,
				`${each.ref}:${each.ref}`,
			]) !== undefined;
		// The forge keeps it now, or nothing changed: no copy stays here.
		readGit(root, ['update-ref', '-d', each.ref, each.commit]);
		if (!pushed) {
			return refused(
				`Could not keep \`${ref}\` on \`${remote}\` (${each.ref}).`,
				'Nothing was removed: the ref is where it was. Check that the remote accepts the push, then retire it again.',
			);
		}
	}
	if (readGit(root, ['update-ref', '-d', ref, commit]) === undefined) {
		return refused(
			`Could not remove \`${ref}\`.`,
			kept.length === 0
				? 'Its tip is already held elsewhere; remove the ref by hand.'
				: `Its tip is kept at ${kept[0]?.ref ?? ''}; remove the ref by hand.`,
		);
	}
	const outcome: IRetirementOutcome = {
		unit: ref,
		reason,
		kept,
		removed: [ref],
		closed: [],
		restore:
			kept[0] === undefined
				? `nothing to restore: \`${delivered ? policy.branches.integration : remote}\` already holds its tip`
				: restoreAdvice(remote, kept[0].ref),
	};
	return { code: EXIT_CODE.OK, data: outcome };
};
