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
import { shortName } from '../development-policy/git-guard-namespaces';
import { execFileSync } from 'node:child_process';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import type {
	ISwarmOverlap,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

export type {
	ISwarmOverlap,
	ISwarmRelation,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';
import { relationsOf, unlandedElsewhere } from './work-swarm-relations.service';

export {
	describeSwarm,
	relationsOf,
	unitKeyOf,
	unlandedElsewhere,
} from './work-swarm-relations.service';

const git = (cwd: string, args: readonly string[], input?: string): string => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			...(input === undefined
				? { stdio: ['ignore', 'pipe', 'ignore'] as const }
				: { input, stdio: ['pipe', 'pipe', 'ignore'] as const }),
			maxBuffer: 16 * 1024 * 1024,
		}).trim();
	} catch {
		return '';
	}
};

/**
 * Every work ref this clone can see: its own branches and every remote's
 * copy, keyed by the logical name so a ref that exists in both is one
 * unit of work and not two.
 */
export const listWorkRefs = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	refPrefix: string = policy.branches.workRefPrefix,
): ReadonlyMap<string, string> => {
	const prefix = shortName(refPrefix);
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
	refPrefix: string = policy.branches.workRefPrefix,
): { readonly agent: string; readonly subject: string } => {
	const prefix = shortName(refPrefix);
	const tail = logicalName.startsWith(prefix)
		? logicalName.slice(prefix.length)
		: logicalName;
	const [agent, ...rest] = tail.split('/');
	return {
		agent: agent ?? 'unknown',
		subject: rest.join('/'),
	};
};

/**
 * The paths `.gitattributes` marks as derived: `linguist-generated` (the
 * convention forges read) or `merge=delendai-generated`.
 */
const derivedOf = (
	root: string,
	paths: readonly string[],
): ReadonlySet<string> => {
	if (paths.length === 0) return new Set();
	const derived = new Set<string>();
	const report = git(
		root,
		['check-attr', '--stdin', 'linguist-generated', 'merge'],
		`${paths.join('\n')}\n`,
	);
	for (const line of report.split('\n')) {
		const match = /^(.*): (linguist-generated|merge): (.*)$/u.exec(line);
		if (match === null) continue;
		const [, path, attribute, value] = match;
		if (path === undefined) continue;
		if (
			(attribute === 'linguist-generated' && value === 'set') ||
			(attribute === 'linguist-generated' && value === 'true') ||
			(attribute === 'merge' && value === 'delendai-generated')
		) {
			derived.add(path);
		}
	}
	return derived;
};

/** Authored paths a unit of work changed, against where it branched from. */
const changedPaths = (
	root: string,
	integration: string,
	sha: string,
): readonly string[] => {
	const base = git(root, ['merge-base', integration, sha]);
	if (base.length === 0) return [];
	const paths = git(root, ['diff', '--name-only', `${base}..${sha}`])
		.split('\n')
		.filter((path) => path.length > 0);
	const derived = derivedOf(root, paths);
	return paths.filter((path) => !derived.has(path));
};

/**
 * Commits two tips share that the integration branch does not have —
 * non-zero exactly when one was built on the other's unlanded work.
 */
const sharedUnlandedCommits = (
	root: string,
	integration: string,
	left: string,
	right: string,
): number => {
	const base = git(root, ['merge-base', left, right]);
	if (base.length === 0) return 0;
	return Number(
		git(root, [
			'rev-list',
			'--count',
			'--no-merges',
			`${integration}..${base}`,
		]) || '0',
	);
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
	const read = (refPrefix: string): ISwarmUnit[] =>
		[...listWorkRefs(root, policy, refPrefix).entries()]
			.map(([name, sha]): ISwarmUnit => {
				const identity = identityOf(name, policy, refPrefix);
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
	const units = read(policy.branches.workRefPrefix);
	const published = read(policy.branches.publicationRefPrefix);
	return {
		integration,
		units,
		overlaps: overlapsOf([
			...units,
			...unlandedElsewhere(units, published),
		]),
		publications: published.map((unit) => unit.ref),
		published,
		relations: relationsOf({
			units,
			published,
			sharedUnlanded: (left, right) =>
				sharedUnlandedCommits(root, integration, left.tip, right.tip),
		}),
	};
};
