#!/usr/bin/env bun
/**
 * reclaim-orphans.script.ts — repo-local orphan reclamation (2026-08-24).
 *
 * This repo's policy: no stranded branches or stashes may remain. Every
 * orphan is either merged into `develop` (when it adds value, leaving the
 * tree 100% functional) or deleted (when it does not). This script is the
 * mechanical half of that policy:
 *
 *   - `--report` (default): classify every local branch and every stash,
 *     and print a copy-pasteable action for each. Read-only.
 *   - `--apply`: delete only the `delete-safe` branches (`ahead === 0` —
 *     the branch tip is fully contained in the base, so nothing is lost).
 *     `needs-review` branches and stashes are NEVER auto-deleted; they are
 *     reported for a value decision (merge to develop, or drop).
 *
 * Units of work are judged by their owner's heartbeat (`judgeUnit`), not
 * by commit counts: a live unit is never an orphan, an idle one is listed
 * for adoption, an abandoned one ends through `delendai work abandon`
 * (which keeps its tip), and a delivered one is reaped by `--apply`. No
 * remedy moves the shared checkout.
 *
 * Classification contract (branches that are not units):
 *   - `delete-safe`  → `ahead === 0`: every commit is already reachable
 *     from the base branch. `git branch -D` loses nothing.
 *   - `needs-review` → `ahead > 0`: the branch carries unique commits.
 *     A human/LLM reviews the diff and either merges it into the base
 *     (fixing any discrepancy and leaving it functional) or deletes it.
 *
 * Stashes are always `needs-review`: their value can only be judged by
 * reading the diff (`git stash show -p <ref>`), so this script never
 * drops them automatically.
 *
 * The pure engine (`buildReclaimReport`) is exported for unit tests; the
 * CLI shell shells out to git. Mirrors the structure of the other
 * `tools/scripts/lint/*.script.ts` engines (pure core + thin CLI).
 */
import { spawnSync } from 'node:child_process';

import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';
import { compileWorkRefParser } from '@delendai/core/lib/startup-reconciler/work-ref-identity';
import type { IUnitStandingEntry } from '@delendai/core/lib/work-units/unit-lease.interface';
import { readWorkspacePolicy } from '@delendai/core/lib/work-units/development-policy.service';
import { readUnitStandings } from '@delendai/core/lib/work-units/unit-standings.service';
import { reapDeliveredUnits } from '@delendai/core/lib/work-units/unit-reaper.service';

/** One local branch with the facts needed to classify it. */
export interface IOrphanBranch {
	readonly name: string;
	/** Commits in this branch not in `baseBranch`. */
	readonly ahead: number;
	/** Commits in `baseBranch` not in this branch. */
	readonly behind: number;
	readonly lastCommitIso: string;
	readonly diffStat: string;
}

/** One stash entry. Value can only be judged by reading its diff. */
export interface IOrphanStash {
	readonly ref: string;
	readonly branch: string | null;
	readonly message: string;
	readonly date: string | null;
}

export type BranchVerdict = 'delete-safe' | 'needs-review';

export interface IReclaimInput {
	/**
	 * The verdict on every unit of work. A branch that is a unit is judged
	 * by its owner's heartbeat, never by how far ahead it is: a unit just
	 * entered is ahead 0 and a unit being typed in is ahead of everything.
	 */
	readonly units?: readonly IUnitStandingEntry[];
	readonly branches: readonly IOrphanBranch[];
	readonly stashes: readonly IOrphanStash[];
	readonly currentBranch: string | null;
	readonly protectedBranches: readonly string[];
}

/** A local unit branch with the verdict that decides what happens to it. */
export interface IOrphanUnit {
	readonly branch: IOrphanBranch;
	readonly unit: IUnitStandingEntry;
}

export interface IReclaimReport {
	/** Units by standing. Only idle and abandoned ones are orphans. */
	readonly liveUnits: readonly IOrphanUnit[];
	readonly idleUnits: readonly IOrphanUnit[];
	readonly abandonedUnits: readonly IOrphanUnit[];
	readonly deliveredUnits: readonly IOrphanUnit[];
	readonly deleteSafeBranches: readonly IOrphanBranch[];
	readonly reviewBranches: readonly IOrphanBranch[];
	readonly stashes: readonly IOrphanStash[];
	/** Branches skipped because they are protected or currently checked out. */
	readonly skipped: readonly string[];
}

/** Pure classifier. `ahead === 0` is the lossless-delete signal. */
export const classifyBranch = (branch: IOrphanBranch): BranchVerdict =>
	branch.ahead === 0 ? 'delete-safe' : 'needs-review';

/** Pure decision engine. No I/O, no side effects. */
export const buildReclaimReport = (input: IReclaimInput): IReclaimReport => {
	const protectedSet = new Set(input.protectedBranches);
	const unitByBranch = new Map(
		(input.units ?? []).map((unit) => [unit.ref, unit]),
	);
	const byStanding = (standing: IUnitStandingEntry['standing']) =>
		input.branches.flatMap((branch): IOrphanUnit[] => {
			const unit = unitByBranch.get(branch.name);
			return unit?.standing === standing &&
				branch.name !== input.currentBranch
				? [{ branch, unit }]
				: [];
		});
	const deleteSafe: IOrphanBranch[] = [];
	const review: IOrphanBranch[] = [];
	const skipped: string[] = [];
	for (const branch of input.branches) {
		if (
			branch.name === input.currentBranch ||
			protectedSet.has(branch.name)
		) {
			skipped.push(branch.name);
			continue;
		}
		if (unitByBranch.has(branch.name)) continue;
		(branch.ahead === 0 ? deleteSafe : review).push(branch);
	}
	return {
		liveUnits: byStanding('live'),
		idleUnits: byStanding('idle'),
		abandonedUnits: byStanding('abandoned'),
		deliveredUnits: byStanding('delivered'),
		deleteSafeBranches: deleteSafe,
		reviewBranches: review,
		stashes: [...input.stashes],
		skipped,
	};
};

// ---------- CLI shell ----------

const DEFAULT_PROTECTED_BRANCHES: readonly string[] = [
	'develop',
	'main',
	'master',
];

const runGit = (
	cwd: string,
	args: readonly string[],
): { readonly ok: boolean; readonly output: string } => {
	const res = spawnSync('git', [...args], { cwd, encoding: 'utf8' });
	if (res.status !== 0) return { ok: false, output: '' };
	return { ok: true, output: (res.stdout ?? '').trim() };
};

const readCurrentBranch = (cwd: string): string | null => {
	const out = runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).output;
	if (out === '' || out === 'HEAD') return null;
	return out;
};

const readAllBranchNames = (cwd: string): readonly string[] => {
	const raw = runGit(cwd, [
		'for-each-ref',
		'--format=%(refname:short)',
		'refs/heads/',
	]).output;
	return raw.length === 0
		? []
		: raw
				.split('\n')
				.map((line) => line.trim())
				.filter((n) => n.length > 0);
};

const aheadBehind = (
	cwd: string,
	base: string,
	branch: string,
): { ahead: number; behind: number } => {
	const raw = runGit(cwd, [
		'rev-list',
		'--left-right',
		'--count',
		`${base}...${branch}`,
	]).output;
	const parts = raw.split(/\s+/u);
	const behind = Number.parseInt(parts[0] ?? '0', 10);
	const ahead = Number.parseInt(parts[1] ?? '0', 10);
	return {
		ahead: Number.isFinite(ahead) ? ahead : 0,
		behind: Number.isFinite(behind) ? behind : 0,
	};
};

const lastCommitIso = (cwd: string, branch: string): string =>
	runGit(cwd, ['log', '-1', '--format=%cI', branch]).output;

const diffStatFor = (cwd: string, base: string, branch: string): string =>
	runGit(cwd, ['diff', '--shortstat', `${base}...${branch}`]).output;

const readBranches = (cwd: string, base: string): readonly IOrphanBranch[] => {
	const names = readAllBranchNames(cwd);
	return names.map((name) => {
		const { ahead, behind } = aheadBehind(cwd, base, name);
		return {
			name,
			ahead,
			behind,
			lastCommitIso: lastCommitIso(cwd, name),
			diffStat: diffStatFor(cwd, base, name),
		};
	});
};

const trimOrNull = (raw: string | undefined): string | null => {
	if (raw === undefined) return null;
	const trimmed = raw.trim();
	return trimmed.length === 0 ? null : trimmed;
};

const parseStashLine = (line: string): IOrphanStash | null => {
	const trimmed = line.trim();
	if (trimmed.length === 0) return null;
	const sep1 = trimmed.indexOf('|');
	if (sep1 === -1) return null;
	const sep2 = trimmed.indexOf('|', sep1 + 1);
	if (sep2 === -1) return null;
	const ref = trimmed.slice(0, sep1);
	const subject = trimmed.slice(sep1 + 1, sep2);
	const date = trimOrNull(trimmed.slice(sep2 + 1));
	const colonIdx = subject.indexOf(':');
	let branch: string | null;
	let message: string;
	if (colonIdx > 0) {
		const candidate = subject.slice(0, colonIdx).trim();
		if (candidate.length > 0 && !/\s/u.test(candidate)) {
			branch = candidate;
			message = subject.slice(colonIdx + 1).trim();
		} else {
			branch = null;
			message = subject.trim();
		}
	} else {
		branch = null;
		message = subject.trim();
	}
	return {
		ref,
		branch,
		message: message.length === 0 ? subject : message,
		date,
	};
};

const readStashes = (cwd: string): readonly IOrphanStash[] => {
	const raw = runGit(cwd, ['stash', 'list', '--format=%gd|%gs|%gD']).output;
	if (raw.length === 0) return [];
	return raw
		.split('\n')
		.map(parseStashLine)
		.filter((entry): entry is IOrphanStash => entry !== null);
};

const deleteBranch = (cwd: string, name: string): boolean =>
	runGit(cwd, ['branch', '-D', name]).ok;

interface ICliArgs {
	readonly cwd: string;
	readonly base: string;
	readonly apply: boolean;
}

const parseArgs = (argv: readonly string[]): ICliArgs => {
	let cwd = process.cwd();
	let base = 'develop';
	let apply = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		switch (arg) {
			case '--cwd':
				cwd = argv[++i] ?? cwd;
				break;
			case '--base':
				base = argv[++i] ?? base;
				break;
			case '--apply':
				apply = true;
				break;
			default:
				break;
		}
	}
	return { cwd, base, apply };
};

/** The commands that resume, publish or end the unit `ref` names. */
export const unitCommands = (
	policy: IResolvedDevelopmentPolicy | undefined,
	ref: string,
): {
	readonly resume: string;
	readonly publish: string;
	readonly abandon: string;
} => {
	const identity =
		policy === undefined
			? undefined
			: compileWorkRefParser(
					policy.branches.workRefTemplate,
					policy.branches.workRefPrefix,
					{ requireKind: false },
				)?.parse(`refs/heads/${ref}`);
	const unit =
		identity === undefined
			? '--proposal=<id> --slice=<slice> --agent=<you>'
			: `--proposal=${identity.proposal} --slice=${identity.slice} --agent=<you>`;
	return {
		resume: `delendai work enter ${unit}${identity?.kind === undefined ? '' : ` --kind=${identity.kind}`}${identity === undefined ? '' : ` --generation=${String(identity.generation)}`}`,
		publish: `delendai work publish ${unit}`,
		abandon: `delendai work abandon --ref=${ref}`,
	};
};

/**
 * How unique commits reach the integration branch under the policy: a
 * profile with work refs lands them through a unit and `work publish`,
 * and never moves the shared checkout; only a profile that commits
 * directly to the integration branch merges by hand.
 */
const landRemedy = (
	policy: IResolvedDevelopmentPolicy | undefined,
	base: string,
	branch: string,
): string =>
	policy === undefined || policy.branches.workRefTemplate.length === 0
		? `git switch ${base} && git merge --no-ff ${branch}  (then fix + validate + commit)`
		: `delendai work enter --proposal=<id> --slice=<slice> --agent=<you>, bring the commits into that unit (git cherry-pick ${base}..${branch} inside its worktree), then delendai work publish`;

const renderUnits = (
	title: string,
	units: readonly IOrphanUnit[],
	policy: IResolvedDevelopmentPolicy | undefined,
	remedies: readonly (keyof ReturnType<typeof unitCommands>)[],
): string[] => {
	if (units.length === 0) return [`${title}: none`];
	const lines = [`${title} (${units.length}):`];
	for (const { branch, unit } of units) {
		const owner =
			unit.owner === null
				? 'owner unknown'
				: `${unit.owner.agent}${unit.owner.session === null ? '' : ` session ${unit.owner.session}`}`;
		lines.push(
			`  - ${branch.name}  ahead ${branch.ahead}; ${owner}; ${unit.reason}`,
		);
		const commands = unitCommands(policy, branch.name);
		for (const remedy of remedies) {
			lines.push(`      ${remedy}: ${commands[remedy]}`);
		}
	}
	return lines;
};

export const renderReport = (
	report: IReclaimReport,
	base: string,
	policy?: IResolvedDevelopmentPolicy,
): string => {
	const lines: string[] = [];
	lines.push(`base branch: ${base}`);
	lines.push('');
	if (report.liveUnits.length > 0) {
		lines.push(
			`live units (${report.liveUnits.length}) — owners are active, not orphans; leave them alone`,
		);
	}
	lines.push(
		...renderUnits(
			'idle units — owner known and quiet, adopt rather than delete',
			report.idleUnits,
			policy,
			['resume', 'publish'],
		),
		...renderUnits(
			'abandoned units — owner gone',
			report.abandonedUnits,
			policy,
			['resume', 'publish', 'abandon'],
		),
	);
	if (report.deliveredUnits.length > 0) {
		lines.push(
			`delivered units (${report.deliveredUnits.length}) — work already landed; \`--apply\` removes their worktree and branch:`,
			...report.deliveredUnits.map(({ unit }) => `  - ${unit.ref}`),
		);
	}
	lines.push('');
	if (report.deleteSafeBranches.length === 0) {
		lines.push('delete-safe branches: none');
	} else {
		lines.push(
			`delete-safe branches (${report.deleteSafeBranches.length}) — ahead 0, safe to delete:`,
		);
		for (const b of report.deleteSafeBranches) {
			lines.push(
				`  - ${b.name}  (behind ${b.behind}; ${b.diffStat || 'no diff'})`,
			);
			lines.push(`      git branch -D ${b.name}`);
		}
	}
	lines.push('');
	if (report.reviewBranches.length === 0) {
		lines.push('needs-review branches: none');
	} else {
		lines.push(
			`needs-review branches (${report.reviewBranches.length}) — unique commits, review then merge or delete:`,
		);
		for (const b of report.reviewBranches) {
			lines.push(
				`  - ${b.name}  ahead ${b.ahead}, behind ${b.behind}; ${b.diffStat || 'no diff'}; last ${b.lastCommitIso || '?'}`,
			);
			lines.push(
				`      review:  git log ${base}..${b.name} && git diff ${base}...${b.name}`,
			);
			lines.push(`      land:    ${landRemedy(policy, base, b.name)}`);
			lines.push(`      delete:  git branch -D ${b.name}`);
		}
	}
	lines.push('');
	if (report.stashes.length === 0) {
		lines.push('stashes: none');
	} else {
		lines.push(
			`stashes (${report.stashes.length}) — review then pop/apply or drop:`,
		);
		for (const s of report.stashes) {
			const when = s.date !== null ? ` (${s.date})` : '';
			lines.push(
				`  - ${s.ref}${s.branch !== null ? ` on ${s.branch}` : ''}${when}: ${s.message}`,
			);
			lines.push(`      review: git stash show -p ${s.ref}`);
			lines.push(
				`      apply:  git stash pop ${s.ref}   (or: drop it after review)`,
			);
		}
	}
	if (report.skipped.length > 0) {
		lines.push('');
		lines.push(
			`skipped (protected or current): ${report.skipped.join(', ')}`,
		);
	}
	return lines.join('\n');
};

const readPolicy = async (
	cwd: string,
): Promise<IResolvedDevelopmentPolicy | undefined> => {
	try {
		return await readWorkspacePolicy(cwd);
	} catch {
		return undefined;
	}
};

const main = async (): Promise<number> => {
	const args = parseArgs(process.argv.slice(2));
	const currentBranch = readCurrentBranch(args.cwd);
	const branches = readBranches(args.cwd, args.base);
	const stashes = readStashes(args.cwd);
	const policy = await readPolicy(args.cwd);
	const units =
		policy === undefined
			? []
			: await readUnitStandings({ root: args.cwd, policy });
	const report = buildReclaimReport({
		branches,
		stashes,
		units,
		currentBranch,
		protectedBranches: DEFAULT_PROTECTED_BRANCHES,
	});

	if (!args.apply) {
		process.stdout.write(`${renderReport(report, args.base, policy)}\n`);
		return 0;
	}

	// --apply: delete only the provably-lossless branches, and reap the
	// delivered units (worktree and branch) whose worktrees hold no edit.
	let deleted = 0;
	for (const branch of report.deleteSafeBranches) {
		if (deleteBranch(args.cwd, branch.name)) {
			process.stdout.write(`deleted ${branch.name}\n`);
			deleted += 1;
		} else {
			process.stderr.write(`FAILED to delete ${branch.name}\n`);
		}
	}
	const reaped =
		policy === undefined
			? []
			: await reapDeliveredUnits({ root: args.cwd, policy, apply: true });
	for (const unit of reaped) {
		process.stdout.write(
			unit.outcome === 'removed'
				? `reaped delivered unit ${unit.ref}\n`
				: `kept delivered unit ${unit.ref}: uncommitted edits in ${unit.worktree ?? '(no worktree)'}: ${unit.edited.join(', ')}\n`,
		);
	}
	process.stdout.write(
		`reclaim-orphans: deleted ${deleted} delete-safe branch(es), reaped ${reaped.filter((u) => u.outcome === 'removed').length} delivered unit(s); ${report.reviewBranches.length} needs-review, ${report.idleUnits.length + report.abandonedUnits.length} idle/abandoned unit(s), ${report.stashes.length} stash(es) left for a decision.\n`,
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
