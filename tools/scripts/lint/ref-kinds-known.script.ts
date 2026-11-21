#!/usr/bin/env bun
/**
 * ref-kinds-known — every ref under the product's namespaces has a kind
 * `ref-kinds.constant.ts` lists.
 *
 * WHY: the reconciler acts on refs by kind. A ref in a folder no kind owns
 * is one nobody reconciles, and strays pile up from there.
 *
 * Exit codes: 0 — every ref has a kind. 1 — a ref under a namespace has none.
 */
import { execFileSync } from 'node:child_process';

import { ownedNamespaces } from '@delendai/core/lib/integration/decisions/namespaces.helper';
import { refKindOf } from '@delendai/core/lib/ref-reconciler/desired-state.helper';

import { declaredBranches } from '../lib/declared-branches';
import { repoRoot } from '../lib/repo-root';

/** `refs/heads/x`, `refs/remotes/origin/x` and `refs/<ns>/x` as the branch-style name. */
export const shortRefName = (ref: string): string =>
	ref
		.replace(/^refs\/heads\//u, '')
		.replace(/^refs\/remotes\/[^/]+\//u, '')
		.replace(/^refs\//u, '');

/** The refs under an owned namespace whose folder no listed kind owns. */
export const unknownKindRefs = (
	refs: readonly string[],
	namespaces: readonly string[],
): readonly string[] =>
	[...new Set(refs.map(shortRefName))].filter((name) =>
		namespaces.some(
			(namespace) =>
				namespace !== '' &&
				name.startsWith(`${namespace}/`) &&
				refKindOf(name, namespace) === undefined,
		),
	);

const main = (): void => {
	const namespaces = ownedNamespaces(declaredBranches(repoRoot()));
	const refs = execFileSync(
		'git',
		['for-each-ref', '--format=%(refname)', 'refs/'],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	)
		.split('\n')
		.filter((line) => line.length > 0);
	const unknown = unknownKindRefs(refs, namespaces);
	if (unknown.length > 0) {
		for (const name of unknown) {
			console.error(
				`ref-kinds: ${name} is under a product namespace but no kind in ref-kinds.constant.ts owns its folder`,
			);
		}
		process.exit(1);
	}
	console.log(
		`✓ ref-kinds: ${String(refs.length)} ref(s) read, none under ${namespaces.join(', ')} without a kind.`,
	);
};

if (import.meta.main) {
	main();
}
