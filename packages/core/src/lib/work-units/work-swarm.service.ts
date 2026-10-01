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
	ISwarmRelation,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

export type {
	ISwarmOverlap,
	ISwarmRelation,
	ISwarmUnit,
	ISwarmView,
} from '../contracts/interfaces/work-swarm.interface';

/**
 * Share of the smaller unit's paths two independent units must have in
 * common before running them at once is called out. Measured on the
 * swarm of 2026-09-30: the pairs that cost a refresh round each were all
 * above 0.9; unrelated pairs stayed under 0.15.
 */
const HIGH_OVERLAP_RATIO = 0.6;

/**
 * Overlapping paths the text view lists before it summarises: a stack of
 * three units shares dozens, and listing them all buried the relations
 * that say what to do about it.
 */
const LISTED_OVERLAPS = 10;

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

/**
 * The proposal slice and generation a unit's subject names, when it
 * follows `<kind>/<proposal>-<slice>-g<n>/<topic>`.
 */
export const unitKeyOf = (
	subject: string,
): { readonly slice: string; readonly generation: string } | undefined => {
	const match = /(?:^|\/)([^/]+)-g(\d+)(?:\/|$)/u.exec(subject);
	if (match?.[1] === undefined || match[2] === undefined) return undefined;
	return { slice: match[1], generation: match[2] };
};

const pairs = <T>(items: readonly T[]): readonly (readonly [T, T])[] =>
	items.flatMap((left, index) =>
		items.slice(index + 1).map((right) => [left, right] as const),
	);

/**
 * What the units of work have to sort out between themselves, worst
 * first. Pure over the units and one question to git — how many unlanded
 * commits two tips share — so a test can ask it anything.
 */
export const relationsOf = (input: {
	readonly units: readonly ISwarmUnit[];
	readonly published: readonly ISwarmUnit[];
	readonly sharedUnlanded: (left: ISwarmUnit, right: ISwarmUnit) => number;
}): readonly ISwarmRelation[] => {
	const landed = input.published.filter((unit) => unit.ahead === 0);
	const live = [
		...input.units,
		...input.published.filter((unit) => unit.ahead > 0),
	];
	const relations: ISwarmRelation[] = landed.map((unit) => ({
		kind: 'landed',
		refs: [unit.ref],
		detail: 'every commit is already integrated; the ref can be deleted',
	}));

	const bySlice = new Map<string, ISwarmUnit[]>();
	for (const unit of live) {
		const key = unitKeyOf(unit.subject);
		if (key === undefined) continue;
		bySlice.set(key.slice, [...(bySlice.get(key.slice) ?? []), unit]);
	}
	const sameSlice = (left: ISwarmUnit, right: ISwarmUnit): boolean =>
		unitKeyOf(left.subject)?.slice !== undefined &&
		unitKeyOf(left.subject)?.slice === unitKeyOf(right.subject)?.slice;
	for (const [slice, holders] of bySlice) {
		// One agent's work ref beside its own publication of the same
		// generation is that agent updating its pull request, not a copy.
		const owners = new Set(
			holders.map(
				(unit) =>
					`${unit.agent}#${unitKeyOf(unit.subject)?.generation ?? ''}`,
			),
		);
		if (owners.size > 1) {
			relations.push({
				kind: 'duplicate',
				refs: holders.map((unit) => unit.ref),
				detail: `${slice} is live ${String(owners.size)} times; keep one`,
			});
		}
	}

	for (const [left, right] of pairs(live)) {
		if (sameSlice(left, right)) continue;
		const shared = input.sharedUnlanded(left, right);
		if (shared > 0) {
			relations.push({
				kind: 'stacked',
				refs: [left.ref, right.ref],
				detail: `${String(shared)} unlanded commit(s) in common: land the base first, then refresh the other`,
			});
			continue;
		}
		const smaller = Math.min(left.paths.length, right.paths.length);
		if (smaller === 0) continue;
		const common = left.paths.filter((path) =>
			right.paths.includes(path),
		).length;
		if (common / smaller >= HIGH_OVERLAP_RATIO) {
			relations.push({
				kind: 'overlap',
				refs: [left.ref, right.ref],
				detail: `${String(common)} of ${String(smaller)} path(s) in common: run them one after the other`,
			});
		}
	}
	return relations;
};

/** The swarm as lines a person reads. */
export const describeSwarm = (view: ISwarmView): readonly string[] => [
	`integration      ${view.integration}`,
	`units of work    ${String(view.units.length)}`,
	...view.units.map(
		(unit) =>
			`  ${unit.agent}  ${unit.subject}  +${String(unit.ahead)}/-${String(unit.behind)}  ${String(unit.paths.length)} path(s)`,
	),
	`publications     ${String(view.published.length)}`,
	...view.published.map(
		(unit) =>
			`  ${unit.agent}  ${unit.subject}  +${String(unit.ahead)}/-${String(unit.behind)}  ${String(unit.paths.length)} path(s)`,
	),
	...(view.overlaps.length === 0
		? ['overlaps         none']
		: [
				`overlaps         ${String(view.overlaps.length)} path(s) more than one unit of work is changing:`,
				...view.overlaps
					.slice(0, LISTED_OVERLAPS)
					.map(
						(overlap) =>
							`  ${overlap.path} — ${String(overlap.refs.length)} units`,
					),
				...(view.overlaps.length > LISTED_OVERLAPS
					? [
							`  … ${String(view.overlaps.length - LISTED_OVERLAPS)} more; --json lists every path and unit`,
						]
					: []),
			]),
	...(view.relations.length === 0
		? ['to sort out      nothing']
		: [
				`to sort out      ${String(view.relations.length)}:`,
				...view.relations.flatMap((relation) => [
					`  ${relation.kind.padEnd(9)} ${relation.detail}`,
					...relation.refs.map((ref) => `            ${ref}`),
				]),
			]),
];

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
			...published.filter((unit) => unit.ahead > 0),
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
