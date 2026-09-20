/**
 * work-swarm.service.ts — what every agent is working on, read from the
 * one place all of them share: git.
 *
 * WHY git and not the operational database: the database is a local,
 * rebuildable view of THIS machine. A swarm spread over several clones —
 * or one agent asking before it starts — needs an answer that is true
 * everywhere, and the work refs are exactly that: published, named after
 * the identity that owns them, and carrying the commits they carry.
 *
 * WHY the overlap is computed from the diffs and not from claims: a
 * claim is enforcement, and it is consulted when a write is attempted —
 * which is after the work exists. The question this answers is the one
 * asked BEFORE the first edit: is somebody already changing this file.
 * Two agents can then decide between themselves, which is what a hive
 * does and a lock does not.
 */
import { execFileSync } from 'node:child_process';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import type {
	ISwarmOverlap,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

export type {
	ISwarmOverlap,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

const git = (cwd: string, args: readonly string[]): string => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			maxBuffer: 16 * 1024 * 1024,
		}).trim();
	} catch {
		return '';
	}
};

const shortName = (value: string): string =>
	value.replace(/^refs\//u, '').replace(/^heads\//u, '');

/**
 * Every work ref this clone can see: its own branches and every remote's
 * copy, keyed by the logical name so a ref that exists in both is one
 * unit of work and not two.
 */
export const listWorkRefs = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
): ReadonlyMap<string, string> => {
	const prefix = shortName(policy.branches.workRefPrefix);
	const refs = new Map<string, string>();
	if (prefix.length === 0) return refs;
	const listed = git(root, [
		'for-each-ref',
		'--format=%(refname)%09%(objectname)',
		// `**` so the pattern crosses the remote's own path components:
		// `refs/remotes/*/ns/wip/` matches nothing, which silently made a
		// swarm spread over several clones look like an empty one.
		`refs/heads/${prefix}**`,
		`refs/remotes/**/${prefix}**`,
	]);
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

/** The identity a work ref name carries, as far as it can be read. */
export const identityOf = (
	logicalName: string,
	policy: IResolvedDevelopmentPolicy,
): { readonly agent: string; readonly subject: string } => {
	const prefix = shortName(policy.branches.workRefPrefix);
	const tail = logicalName.startsWith(prefix)
		? logicalName.slice(prefix.length)
		: logicalName;
	const [agent, ...rest] = tail.split('/');
	return {
		agent: agent ?? 'unknown',
		subject: rest.join('/'),
	};
};

/** Paths a unit of work changed, against where it branched from. */
const changedPaths = (
	root: string,
	integration: string,
	sha: string,
): readonly string[] => {
	const base = git(root, ['merge-base', integration, sha]);
	if (base.length === 0) return [];
	return git(root, ['diff', '--name-only', `${base}..${sha}`])
		.split('\n')
		.filter((path) => path.length > 0);
};

/** How far a unit of work is from the integration branch, both ways. */
const distance = (
	root: string,
	integration: string,
	sha: string,
): { readonly ahead: number; readonly behind: number } => {
	const counts = git(root, [
		'rev-list',
		'--left-right',
		'--count',
		`${integration}...${sha}`,
	]).split(/\s+/u);
	return {
		behind: Number(counts[0] ?? '0'),
		ahead: Number(counts[1] ?? '0'),
	};
};

/** Which paths more than one unit of work is touching. */
export const overlapsOf = (
	units: readonly ISwarmUnit[],
): readonly ISwarmOverlap[] => {
	const byPath = new Map<string, string[]>();
	for (const unit of units) {
		for (const path of unit.paths) {
			byPath.set(path, [...(byPath.get(path) ?? []), unit.ref]);
		}
	}
	return [...byPath.entries()]
		.filter(([, refs]) => refs.length > 1)
		.map(([path, refs]) => ({ path, refs }))
		.sort((left, right) => (left.path < right.path ? -1 : 1));
};

/** Read the swarm. Nothing here writes, fetches or locks. */
export const readSwarm = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
}): ISwarmView => {
	const { root, policy } = input;
	const integration = policy.branches.integration;
	const units: ISwarmUnit[] = [...listWorkRefs(root, policy).entries()]
		.map(([name, sha]): ISwarmUnit => {
			const identity = identityOf(name, policy);
			return {
				ref: name,
				agent: identity.agent,
				subject: identity.subject,
				tip: sha,
				...distance(root, integration, sha),
				paths: changedPaths(root, integration, sha),
			};
		})
		.sort((left, right) => (left.ref < right.ref ? -1 : 1));
	const publications = git(root, [
		'for-each-ref',
		'--format=%(refname:short)',
		`refs/remotes/**/${shortName(policy.branches.publicationRefPrefix)}**`,
	])
		.split('\n')
		.filter((name) => name.length > 0)
		.map((name) => name.replace(/^[^/]+\//u, ''));
	return {
		integration,
		units,
		overlaps: overlapsOf(units),
		publications: [...new Set(publications)].sort(),
	};
};
