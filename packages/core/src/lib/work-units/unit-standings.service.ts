/**
 * unit-standings.service.ts — the verdict on every unit of a clone.
 *
 * Reads git (the work refs, what contains their tips) and the leases, and
 * hands each unit to `judgeUnit`. Every consumer — ref-lifecycle,
 * `reclaim:orphans`, `work status`, the overview, `work abandon` and the
 * reaper — reads this, so they cannot disagree about a unit.
 */
import { shortName } from '../development-policy/git-guard-namespaces';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { listUnitLeases, removeUnitLease } from './unit-lease.store';
import { gitCommonDirOf } from './unit-lease.service';
import type {
	IReadUnitStandings,
	IUnitLease,
	IUnitStanding,
	IUnitStandingEntry,
} from './unit-lease.interface';
import { judgeUnit, leaseWindowSeconds } from './unit-verdict.service';
import { listWorkRefs } from './work-swarm.service';
import { integrationBase, readGit } from './work-unit-shared.service';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Whether a unit's tip is contained in a publication ref. */
const publishedElsewhere = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	sha: string,
): boolean => {
	const prefix = shortName(policy.branches.publicationRefPrefix);
	if (prefix.length === 0) return false;
	const holders = readGit(root, [
		'for-each-ref',
		'--contains',
		sha,
		'--format=%(refname)',
		`refs/heads/${prefix}**`,
		`refs/remotes/**/${prefix}**`,
	]);
	return holders !== undefined && holders.length > 0;
};

/**
 * Whether the unit ever carried work of its own. A unit just entered
 * points at the integration branch, so "contained in it" proves nothing
 * until the ref has moved off the commit it was made from.
 */
const hasMoved = (
	root: string,
	ref: string,
	sha: string,
	lease: IUnitLease | undefined,
): boolean => {
	if (lease?.entrySha !== null && lease?.entrySha !== undefined) {
		return lease.entrySha !== sha;
	}
	const history = readGit(root, ['reflog', 'show', '--format=%H', ref]);
	return (
		new Set((history ?? '').split('\n').filter((l) => l.length > 0)).size >
		1
	);
};

const isDelivered = (
	root: string,
	policy: IResolvedDevelopmentPolicy,
	ref: string,
	sha: string,
	lease: IUnitLease | undefined,
): boolean => {
	// Containment proves nothing for a unit that never moved off the commit
	// it was made from: that commit is in the integration branch and in
	// every publication that merged it.
	if (!hasMoved(root, ref, sha, lease)) return false;
	if (publishedElsewhere(root, policy, sha)) return true;
	const base = integrationBase(root, policy);
	return (
		base !== undefined &&
		readGit(root, ['merge-base', '--is-ancestor', sha, base]) !== undefined
	);
};

/** Whether a local branch of this name exists (a remote-only unit has none). */
export const hasLocalBranch = (root: string, ref: string): boolean =>
	readGit(root, ['rev-parse', '-q', '--verify', `refs/heads/${ref}`]) !==
	undefined;

export const readUnitStandings = async (
	input: IReadUnitStandings,
): Promise<readonly IUnitStandingEntry[]> => {
	const { root, policy } = input;
	const now = input.now ?? nowSeconds();
	const common = gitCommonDirOf(root);
	const leases =
		common === undefined
			? new Map<string, IUnitLease>()
			: await listUnitLeases(common);
	const window = leaseWindowSeconds(policy.coordination.leaseTtlMinutes);
	return [...listWorkRefs(root, policy).entries()]
		.map(([ref, sha]): IUnitStandingEntry => {
			const lease = leases.get(ref);
			const tipAt = Number(
				readGit(root, ['log', '-1', '--format=%ct', sha]),
			);
			const verdict = judgeUnit({
				lease,
				...(Number.isFinite(tipAt) && tipAt > 0 ? { tipAt } : {}),
				delivered: isDelivered(root, policy, ref, sha, lease),
				now,
				windowSeconds: window,
			});
			return { ref, worktree: lease?.worktree ?? null, ...verdict };
		})
		.sort((left, right) => (left.ref < right.ref ? -1 : 1));
};

/** Counts per standing, for surfaces that pay per byte. */
export const countStandings = (
	entries: readonly IUnitStandingEntry[],
): Readonly<Record<IUnitStanding, number>> => {
	const counts: Record<IUnitStanding, number> = {
		live: 0,
		idle: 0,
		abandoned: 0,
		delivered: 0,
	};
	for (const entry of entries) counts[entry.standing] += 1;
	return counts;
};

/** The command that deals with the most urgent kind of unit, if any. */
const nextCommand = (
	counts: Readonly<Record<IUnitStanding, number>>,
): { readonly command: string; readonly why: string } | null => {
	if (counts.delivered > 0)
		return { command: 'work reap --apply', why: 'reap delivered units' };
	if (counts.abandoned > 0)
		return {
			command: 'work abandon --ref=<ref>',
			why: 'end abandoned units',
		};
	if (counts.idle > 0)
		return { command: 'work swarm', why: 'adopt or wait for idle units' };
	return null;
};

/** One line and a next action, never a list. */
export const summarizeStandings = (
	entries: readonly IUnitStandingEntry[],
): { readonly line: string; readonly nextAction: string | null } => {
	const counts = countStandings(entries);
	const line = `units: ${String(counts.live)} live, ${String(counts.idle)} idle, ${String(counts.abandoned)} abandoned, ${String(counts.delivered)} delivered`;
	const next = nextCommand(counts);
	return {
		line,
		nextAction:
			next === null ? null : `${next.why}: \`delendai ${next.command}\``,
	};
};

/**
 * The overview's line, in the fewest bytes the payload budget allows: the
 * counts that need somebody, and the command. Nothing at all while every
 * unit is live (or there are none) — the common case costs no bytes.
 */
export const overviewUnitsLine = async (
	input: IReadUnitStandings,
): Promise<string | undefined> => {
	const counts = countStandings(await readUnitStandings(input));
	const next = nextCommand(counts);
	if (next === null) return undefined;
	const waiting = (['delivered', 'abandoned', 'idle'] as const)
		.filter((standing) => counts[standing] > 0)
		.map((standing) => `${String(counts[standing])} ${standing}`);
	return `${waiting.join(' ')}: ${next.command}`;
};

/** Drop the leases of units whose ref no longer exists (published or ended). */
export const pruneUnitLeases = async (
	input: IReadUnitStandings,
): Promise<number> => {
	const common = gitCommonDirOf(input.root);
	if (common === undefined) return 0;
	const alive = listWorkRefs(input.root, input.policy);
	let pruned = 0;
	for (const ref of (await listUnitLeases(common)).keys()) {
		if (alive.has(ref)) continue;
		await removeUnitLease(common, ref);
		pruned += 1;
	}
	return pruned;
};

/** The verdict on one unit, or undefined when the clone has no such ref. */
export const unitVerdictOf = async (
	input: IReadUnitStandings,
	ref: string,
): Promise<IUnitStandingEntry | undefined> =>
	(await readUnitStandings(input)).find(
		(entry) => entry.ref === ref.replace(/^refs\/heads\//u, ''),
	);

/**
 * Whether a unit still holds the slice it was entered for. An abandoned
 * unit does not: its owner is gone, so the slice is offered for adoption
 * (`work claim`) instead of refusing everyone else. A delivered unit has
 * landed its slice. Live and idle units hold it — an idle owner is only
 * quiet. A ref with no verdict is assumed to hold, the cautious reading.
 */
export const isUnitHolding = (
	entries: readonly IUnitStandingEntry[],
	ref: string,
): boolean => {
	const standing = entries.find((entry) => entry.ref === ref)?.standing;
	return standing !== 'abandoned' && standing !== 'delivered';
};
