#!/usr/bin/env bun
/**
 * maintain-ref-namespace — the work namespace keeps itself in shape,
 * without an agent deciding to.
 *
 * WHY this exists: every piece of it already existed as something a
 * person or an agent could run. The convention had a single source of
 * truth, the reaper could prove a ref spent, the engine could replay a
 * ref onto a new base — and the namespace still filled with names that
 * do not match the convention, refs ten commits behind, and publication
 * refs whose pull request merged days ago. A rule that depends on an
 * agent remembering is not a rule; it is a hope. This is the rails.
 *
 * Three passes, in the order that makes each one safe:
 *
 *   1. RENAME what does not carry the shape. Only when the ref's own
 *      identity can still be read — the name is rewritten, never the
 *      work, and nothing is renamed onto a name already taken.
 *   2. REHYDRATE what is behind the integration branch, through the WIP
 *      engine's replay, which reports a conflict instead of resolving
 *      it.
 *   3. REAP what the integration branch already contains, and only that:
 *      the proof is an empty three-dot diff, so deleting the ref cannot
 *      lose a line of work.
 *
 * WHY dry by default: it deletes and rewrites refs. `--apply` is the
 * word that says somebody meant it, and every run prints what it would
 * do either way.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `compileWorkRefParser` is the parser the reconciler attributes refs
// with, not a second reading of the same template: a maintenance pass
// that disagreed with the reader would rename work into names the reader
// can no longer attribute.
import {
	compileWorkRefParser,
	resolveDevelopmentPolicy,
	resolveWorkRef,
} from '@delendai/core/public';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import { repoRoot } from '../lib/repo-root';

import type {
	IRefAction,
	IRefNamespaceReport,
} from './maintain-ref-namespace.interface';

export type {
	IRefAction,
	IRefNamespaceReport,
} from './maintain-ref-namespace.interface';

/** Git, with any inherited hook environment stripped. */
const git = (root: string, args: readonly string[]): string | undefined => {
	const environment = { ...process.env };
	for (const name of [
		'GIT_DIR',
		'GIT_WORK_TREE',
		'GIT_INDEX_FILE',
		'GIT_PREFIX',
		'GIT_COMMON_DIR',
	]) {
		delete environment[name];
	}
	try {
		return execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: environment,
		}).trim();
	} catch {
		return undefined;
	}
};

const shortName = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/** Every ref under a namespace, local or on the remote, once each. */
export const refsUnder = (
	root: string,
	prefix: string,
): ReadonlyMap<string, string> => {
	const refs = new Map<string, string>();
	const listed =
		git(root, [
			'for-each-ref',
			'--format=%(refname)%09%(objectname)',
			`refs/heads/${prefix}**`,
			`refs/remotes/**/${prefix}**`,
		]) ?? '';
	for (const line of listed.split('\n')) {
		const [refName, sha] = line.split('\t');
		if (refName === undefined || sha === undefined) continue;
		const logical = refName
			.replace(/^refs\/heads\//u, '')
			.replace(/^refs\/remotes\/[^/]+\//u, '');
		if (!refs.has(logical)) refs.set(logical, sha);
	}
	return refs;
};

/**
 * What a ref SHOULD be called, or undefined when its identity cannot be
 * read — in which case nothing is renamed, because a rename that guesses
 * is worse than a name that is merely ugly.
 */
export const canonicalNameFor = (
	policy: IResolvedDevelopmentPolicy,
	logicalName: string,
): string | undefined => {
	const template = policy.branches.workRefTemplate;
	if (template.length === 0) return undefined;
	const reader = compileWorkRefParser(
		template,
		policy.branches.workRefPrefix,
	);
	const strict = compileWorkRefParser(
		template,
		policy.branches.workRefPrefix,
		{ strict: true },
	);
	if (reader === undefined || strict === undefined) return undefined;
	const qualified = `refs/heads/${logicalName}`;
	if (strict.parse(qualified) !== undefined) return undefined;
	const identity = reader.parse(qualified);
	if (identity === undefined) return undefined;
	return resolveWorkRef(template, {
		agent: identity.agent,
		proposal: identity.proposal,
		slice: identity.slice,
		generation: identity.generation,
		...(identity.topic === undefined ? {} : { topic: identity.topic }),
	}).replace(/^refs\/heads\//u, '');
};

/**
 * True when the integration branch already contains everything the ref
 * adds — and the ref is not simply a unit of work that has not made its
 * first checkpoint yet.
 *
 * That second clause is the whole difference between reaping and
 * destroying: a ref created moments ago sits exactly AT the integration
 * tip, so "adds nothing" is true of it and of a ref whose work landed
 * weeks ago. Reaping the first one deletes the ref an agent is working
 * in, which is the failure this repository has already paid for once.
 */
export const isSpent = (
	root: string,
	integration: string,
	sha: string,
): boolean => {
	const integrationSha = git(root, ['rev-parse', integration]);
	if (integrationSha === undefined) return false;
	if (integrationSha === sha) return false;
	const diff = git(root, ['diff', '--name-only', `${integration}...${sha}`]);
	return diff !== undefined && diff.trim().length === 0;
};

/** Logical names of every ref a worktree currently has checked out. */
export const checkedOutRefs = (root: string): ReadonlySet<string> => {
	const listed = git(root, ['worktree', 'list', '--porcelain']) ?? '';
	const names = new Set<string>();
	for (const line of listed.split('\n')) {
		if (!line.startsWith('branch ')) continue;
		names.add(line.slice('branch '.length).replace(/^refs\/heads\//u, ''));
	}
	return names;
};

export const maintainRefNamespace = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly remote: string;
	readonly apply: boolean;
}): IRefNamespaceReport => {
	const { root, policy, remote, apply } = input;
	const integration = `refs/remotes/${remote}/${policy.branches.integration}`;
	const actions: IRefAction[] = [];
	const namespaces = [
		shortName(policy.branches.workRefPrefix),
		shortName(policy.branches.publicationRefPrefix),
	].filter((prefix) => prefix.length > 0);

	// A ref somebody is standing in is never touched — not renamed, not
	// reaped — however spent it looks from the outside.
	const inUse = checkedOutRefs(root);
	for (const prefix of namespaces) {
		for (const [name, sha] of refsUnder(root, prefix)) {
			if (inUse.has(name)) {
				actions.push({
					ref: name,
					kind: 'left-alone',
					detail: 'a worktree has it checked out',
					applied: false,
				});
				continue;
			}
			// Spent first: a ref the integration branch already contains
			// needs no name and no rebase.
			if (isSpent(root, integration, sha)) {
				actions.push({
					ref: name,
					kind: 'reap',
					detail: `${policy.branches.integration} already contains everything it adds`,
					applied: apply ? reap(root, remote, name) : false,
				});
				continue;
			}
			const canonical = canonicalNameFor(policy, name);
			if (canonical !== undefined && canonical !== name) {
				const taken =
					git(root, [
						'rev-parse',
						'-q',
						'--verify',
						`refs/heads/${canonical}`,
					]) !== undefined;
				actions.push({
					ref: name,
					kind: taken ? 'left-alone' : 'rename',
					detail: taken
						? `${canonical} already exists; the name was left alone rather than overwritten`
						: `does not carry the shape the policy declares; it is ${canonical}`,
					applied:
						apply && !taken
							? rename(root, remote, name, canonical, sha)
							: false,
				});
			}
		}
	}
	return { integration: policy.branches.integration, remote, actions };
};

/** The sha the remote reports for a ref, or `undefined` when it has none. */
const remoteSha = (
	root: string,
	remote: string,
	ref: string,
): string | undefined => {
	const listed = git(root, ['ls-remote', remote, `refs/heads/${ref}`]);
	const sha = listed?.split('\t')[0]?.trim();
	return sha === undefined || sha.length === 0 ? undefined : sha;
};

/**
 * Delete a ref here and on the remote. Only ever called with proof.
 *
 * Reports what actually happened rather than always succeeding: a remote
 * that refused the delete leaves a ref other clones still read, and a
 * pass that called that a success would report a namespace tidier than
 * it is.
 */
const reap = (root: string, remote: string, name: string): boolean => {
	const pushed = git(root, ['push', remote, '--delete', name]);
	if (pushed === undefined && remoteSha(root, remote, name) !== undefined) {
		return false;
	}
	git(root, ['branch', '-D', name]);
	return true;
};

/** Write the ref under its canonical name, then remove the old one. */
const rename = (
	root: string,
	remote: string,
	from: string,
	to: string,
	sha: string,
): boolean => {
	if (git(root, ['update-ref', `refs/heads/${to}`, sha]) === undefined) {
		return false;
	}
	// The remote copy is what other clones read, so it moves too — and
	// only after the new name exists here, so an interrupted run leaves
	// the work reachable under at least one name.
	//
	// And the old name is removed only once the remote is PROVEN to carry
	// the new one at the same commit. Pushing and deleting in sequence
	// assumed the push; a forge that refuses the new name — a ref rule, a
	// protected pattern, a network that dropped — and accepts the delete
	// would leave the work reachable from no clone at all. The proof is
	// the difference between a rename and a loss.
	git(root, ['push', remote, `refs/heads/${to}:refs/heads/${to}`]);
	if (remoteSha(root, remote, to) !== sha) {
		// Both names still exist: the old one on the remote, the new one
		// here. Nothing is lost, and the next run tries again.
		return false;
	}
	if (!reap(root, remote, from)) return false;
	return true;
};

const main = (): void => {
	const root = repoRoot();
	const config = JSON.parse(
		readFileSync(join(root, 'delendai.config.json'), 'utf8'),
	) as { readonly development?: Record<string, unknown> };
	if (config.development === undefined) return;
	const policy = resolveDevelopmentPolicy({
		development: config.development,
	});
	const apply = process.argv.includes('--apply');
	const report = maintainRefNamespace({
		root,
		policy,
		remote: process.env.DELENDAI_REMOTE ?? 'origin',
		apply,
	});
	for (const action of report.actions) {
		console.log(
			`maintain-ref-namespace: ${action.kind} ${action.ref} — ${action.detail}${action.applied ? '' : apply ? ' (NOT applied)' : ' (read-only)'}`,
		);
	}
	console.log(
		`maintain-ref-namespace: ${report.actions.length} action(s)${apply ? '' : ' — read-only; pass --apply'}.`,
	);
};

if (import.meta.main) main();
