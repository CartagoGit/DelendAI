/**
 * namespace-rename.service.ts — the explicit command that renames the refs
 * still under a former namespace prefix (f00808 S7).
 *
 * Nothing renames a ref on its own: this runs only when asked, is a dry
 * run unless `apply`, and never touches a ref that has an open pull
 * request. The forge's branch-rename API is never called: it closed every
 * open pull request of the branches it renamed. Each ref is renamed by
 * pushing the new name at the SAME tip, verifying it, keeping the old tip
 * under the retired root, and only then deleting the old name, so a failed
 * step leaves both names and loses nothing.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	ownedPublicationRefPrefixes,
	ownedWorkRefPrefixes,
	retiredRefRoots,
	shortName,
} from '../integration/decisions/namespaces.helper';
import type {
	INamespaceRef,
	INamespaceRenamed,
	INamespaceRenameOutcome,
	INamespaceRenamePorts,
	INamespaceRenameReport,
} from '../contracts/interfaces/namespace-rename.interface';
import { runGitCommand } from '../shared/git-command.helper';

const CONFIG_LINE =
	'remove `formerNamespacePrefixes` from `development.branches` in delendai.config.json';

/** `[former prefix, current prefix]` pairs, as branch names. */
const prefixMoves = (
	policy: IResolvedDevelopmentPolicy,
): readonly (readonly [string, string])[] => {
	const pair = (owned: readonly string[]): [string, string][] => {
		const [current, ...former] = owned.map(shortName);
		return current === undefined || current === ''
			? []
			: former
					.filter((prefix) => prefix !== '' && prefix !== current)
					.map((prefix): [string, string] => [prefix, current]);
	};
	return [
		...pair(ownedWorkRefPrefixes(policy.branches)),
		...pair(ownedPublicationRefPrefixes(policy.branches)),
	];
};

const underAny = (name: string, prefixes: readonly string[]): boolean =>
	prefixes.some((prefix) => name.startsWith(prefix));

export const renameNamespace = (input: {
	readonly policy: IResolvedDevelopmentPolicy;
	readonly ports: INamespaceRenamePorts;
	readonly apply: boolean;
}): INamespaceRenameReport => {
	const { policy, ports, apply } = input;
	const moves = prefixMoves(policy);
	const formers = moves.map(([former]) => former);
	const refused = (why: string): INamespaceRenameReport => ({
		apply,
		refused: why,
		refs: [],
		message: `refused: ${why}`,
	});
	if (moves.length === 0)
		return refused('the policy declares no former namespace prefix');
	const refs = ports.heads(formers);
	if (refs.length === 0)
		return {
			apply,
			refs: [],
			message: `No ref is left under a former prefix; ${CONFIG_LINE}.`,
		};
	const openHeads = ports.openPullRequestHeads();
	if (openHeads === undefined)
		return refused(
			'the forge cannot be read, so open pull requests are unknown',
		);
	const blocking = openHeads.filter((head) => underAny(head, formers));
	if (blocking.length > 0)
		return refused(
			`open pull requests have their head under a former prefix (${blocking.join(', ')}); rename nothing until they end`,
		);
	const retiredRoot = retiredRefRoots(policy.branches)[0] ?? 'refs/retired/';
	const renamed: INamespaceRenamed[] = [];
	for (const ref of refs) {
		const move = moves.find(([former]) => ref.name.startsWith(former));
		if (move === undefined) continue;
		const to = `${move[1]}${ref.name.slice(move[0].length)}`;
		const row = (outcome: INamespaceRenameOutcome): void => {
			renamed.push({ from: ref.name, to, outcome });
		};
		if (!apply) {
			row('would-rename');
			continue;
		}
		// Checked again just before acting: the tip may have moved and a
		// pull request may have opened since the listing.
		if (ports.tipOf(ref.name) !== ref.sha) {
			row('skipped-changed');
			continue;
		}
		const nowOpen = ports.openPullRequestHeads();
		if (nowOpen === undefined || nowOpen.includes(ref.name)) {
			row('skipped-open-pull-request');
			continue;
		}
		const done =
			ports.push(to, ref.sha) &&
			ports.verify(to, ref.sha) &&
			ports.keep(`${retiredRoot}${ref.name}`, ref.sha) &&
			ports.remove(ref.name);
		row(done ? 'renamed' : 'failed');
	}
	const left = renamed.filter((entry) => entry.outcome !== 'renamed').length;
	return {
		apply,
		refs: renamed,
		message: !apply
			? `${renamed.length} ref(s) would be renamed; run again with --apply.`
			: left === 0
				? `Renamed ${renamed.length} ref(s). No ref is left under a former prefix; ${CONFIG_LINE}.`
				: `Renamed ${renamed.length - left} ref(s); ${left} left for a later run.`,
	};
};

/** The ports over a real clone and its remote, with the forge read injected. */
export const gitNamespaceRenamePorts = (input: {
	readonly root: string;
	readonly remote: string;
	readonly openPullRequestHeads: () => readonly string[] | undefined;
}): INamespaceRenamePorts => {
	const { root, remote } = input;
	const lsRemote = (pattern: string): readonly INamespaceRef[] =>
		runGitCommand(root, ['ls-remote', '--heads', remote, pattern])
			.out.split('\n')
			.filter((line) => line.length > 0)
			.flatMap((line) => {
				const [sha, ref] = line.split('\t');
				return sha === undefined || ref === undefined
					? []
					: [{ name: ref.replace(/^refs\/heads\//u, ''), sha }];
			});
	const tipOf = (name: string): string | undefined =>
		lsRemote(`refs/heads/${name}`).find((ref) => ref.name === name)?.sha;
	return {
		heads: (prefixes) =>
			prefixes.flatMap((prefix) => lsRemote(`refs/heads/${prefix}*`)),
		tipOf,
		openPullRequestHeads: input.openPullRequestHeads,
		push: (name, sha) =>
			runGitCommand(root, ['push', remote, `${sha}:refs/heads/${name}`])
				.ok,
		verify: (name, sha) => tipOf(name) === sha,
		keep: (retiredRef, sha) =>
			runGitCommand(root, ['update-ref', retiredRef, sha]).ok,
		remove: (name) =>
			runGitCommand(root, ['push', remote, `:refs/heads/${name}`]).ok,
	};
};
