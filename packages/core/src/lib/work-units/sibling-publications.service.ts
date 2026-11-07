/**
 * sibling-publications.service.ts — two open publications of one unit
 * (x01032).
 *
 * A reviewer's wip went out as a second pull request while its first pack
 * (four verdicts the wip lacked) stayed open: each held commits the other
 * lacked, and the pack with a verdict had lost its claim. Publishing a
 * unit now looks at the other publications of the same agent and unit
 * first: one holding commits this tip lacks is merged in, never left
 * behind; one this tip contains completely is retired, its pull request
 * closed with a link to the new one, its tip kept.
 */
import { execFileSync } from 'node:child_process';

import { runGitCommand } from '../shared/git-command.helper';
import type {
	ISiblingPublicationGit,
	ISiblingStep,
	ISiblingVerdict,
} from '../contracts/interfaces/sibling-publication.interface';

/** `<prefix>/pr/<agent>/<kind>/<unit>/<topic>`, whatever the kind. */
const PUBLICATION =
	/^(?<prefix>[^/]+)\/pr\/(?<agent>[^/]+)\/(?<kind>[^/]+)\/(?<unit>[^/]+)\//u;

/** The other publication refs of the same agent and unit. */
export const siblingRefs = (
	publicationRef: string,
	remoteRefs: readonly string[],
): readonly string[] => {
	const mine = PUBLICATION.exec(publicationRef)?.groups;
	if (mine === undefined) return [];
	return remoteRefs.filter((ref) => {
		if (ref === publicationRef) return false;
		const other = PUBLICATION.exec(ref)?.groups;
		return (
			other !== undefined &&
			other.agent === mine.agent &&
			other.unit === mine.unit
		);
	});
};

export const judgeSiblings = (
	git: ISiblingPublicationGit,
	remote: string,
	publicationRef: string,
	tip: string,
): ISiblingVerdict => {
	const listed = git([
		'for-each-ref',
		'--format=%(refname:short)',
		`refs/remotes/${remote}/`,
	]);
	const remoteRefs = listed.ok
		? listed.out
				.split('\n')
				.map((ref) => ref.replace(`${remote}/`, ''))
				.filter((ref) => ref.length > 0)
		: [];
	const lacking: string[] = [];
	const contained: string[] = [];
	const own = publicationRef.replace(/^refs\/heads\//u, '');
	for (const ref of siblingRefs(own, remoteRefs)) {
		const inside = git([
			'merge-base',
			'--is-ancestor',
			`refs/remotes/${remote}/${ref}`,
			tip,
		]);
		(inside.ok ? contained : lacking).push(ref);
	}
	return { lacking, contained };
};

/** A step of retiring a superseded publication, reported by `work publish`. */
export const retireSibling = (input: {
	readonly git: ISiblingPublicationGit;
	readonly gh: (args: readonly string[]) => string | undefined;
	readonly remote: string;
	readonly sibling: string;
	readonly by: string;
}): readonly ISiblingStep[] => {
	const { git, gh, remote, sibling, by } = input;
	const kept = sibling.replace('/pr/', '/retired/');
	const keep = git([
		'branch',
		'-f',
		kept,
		`refs/remotes/${remote}/${sibling}`,
	]);
	if (!keep.ok) {
		return [
			{
				name: 'retire-sibling',
				ok: false,
				detail: `could not keep ${sibling}: ${keep.out}; it was left open.`,
			},
		];
	}
	// The pull request is closed before its branch goes, so the forge
	// does not read the deletion as a bare close.
	const found = gh([
		'api',
		`repos/{owner}/{repo}/pulls?head={owner}:${sibling}&state=open`,
		'--jq',
		'.[0].number',
	]);
	const closed =
		found === undefined || found === ''
			? undefined
			: gh([
					'api',
					'-X',
					'PATCH',
					`repos/{owner}/{repo}/pulls/${found}`,
					'-f',
					'state=closed',
					'--jq',
					'.html_url',
				]);
	if (found !== undefined && found !== '' && closed !== undefined) {
		gh([
			'api',
			`repos/{owner}/{repo}/issues/${found}/comments`,
			'-f',
			`body=Superseded: ${by} contains every commit of this publication, so it is retired and its tip kept at ${kept}.`,
		]);
	}
	const removed = git(['push', '--', remote, `:refs/heads/${sibling}`]);
	return [
		{
			name: 'retire-sibling',
			ok: removed.ok,
			detail: removed.ok
				? `${sibling} is contained in ${by}: retired, tip kept at ${kept}${closed === undefined ? '' : ', pull request closed'}.`
				: `${sibling} is contained in ${by}, but its remote ref was not removed: ${removed.out}.`,
		},
	];
};

/** What a refused publication tells its author to merge. */
export const lackingDetail = (
	lacking: readonly string[],
	workRef: string,
	remote: string,
): string =>
	`${lacking.join(', ')} holds commits ${workRef} lacks; nothing was pushed. Merge it into the unit, then publish again: git merge ${remote}/${lacking[0] ?? ''}`;

/** Retire every sibling the new publication contains. */
export const retireContained = (
	root: string,
	contained: readonly string[],
	remote: string,
	by: string,
): readonly ISiblingStep[] =>
	contained.flatMap((sibling) =>
		retireSibling({
			git: (args) => runGitCommand(root, args),
			gh: (args) => {
				try {
					return execFileSync('gh', [...args], {
						cwd: root,
						encoding: 'utf8',
						stdio: ['ignore', 'pipe', 'ignore'],
					}).trim();
				} catch {
					return undefined;
				}
			},
			remote,
			sibling,
			by,
		}),
	);
