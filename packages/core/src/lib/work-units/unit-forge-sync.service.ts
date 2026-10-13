/**
 * unit-forge-sync.service.ts — a start leaves every unit in step with the
 * forge, so work continues from any machine.
 *
 * A unit's commits used to reach the forge only when it was published,
 * and nothing brought in what the same unit gained on another computer.
 * The state an agent resumed from depended on which machine it was on:
 * work left at home was missing at the office, and was done again there.
 * Each start now pushes what the forge lacks, fast-forwards what this
 * clone lacks, creates here the units made elsewhere, and commits and
 * pushes the uncommitted edits of a unit nobody is working in. Nothing is
 * ever overwritten: a branch that moved on both sides is reported with
 * the command that reconciles it.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type {
	IUnitForgeSync,
	IUnitForgeSyncInput,
} from '../contracts/interfaces/unit-forge-sync.interface';
import { UNIT_FORGE_SYNC_VARIABLE } from '../contracts/constants/unit-forge-sync.constant';
import { createGitRunner } from '../shared/git-write';
import { resolveDurabilityRemote } from '../wip-engine/durability-remote';
import { resolveWorkRef } from '../wip-engine/ref-name';
import { readUnitStandings } from './unit-standings.service';

const lines = (text: string): readonly string[] =>
	text.split('\n').filter((line) => line.length > 0);

/** `{ branch → sha }` of the refs under `prefix`, keyed without it. */
const refsUnder = async (
	run: IGitRunner,
	prefix: string,
): Promise<ReadonlyMap<string, string>> => {
	const listed = await run([
		'for-each-ref',
		'--format=%(objectname) %(refname)',
		prefix,
	]);
	const refs = new Map<string, string>();
	if (!listed.ok) return refs;
	for (const line of lines(listed.output)) {
		const [sha = '', name = ''] = line.split(' ');
		refs.set(name.slice(prefix.length), sha);
	}
	return refs;
};

/** The worktree each branch is checked out in. */
const worktreesByBranch = async (
	run: IGitRunner,
): Promise<ReadonlyMap<string, string>> => {
	const listed = await run(['worktree', 'list', '--porcelain']);
	const found = new Map<string, string>();
	if (!listed.ok) return found;
	for (const block of listed.output.split('\n\n')) {
		const path = /^worktree (.+)$/mu.exec(block)?.[1];
		const branch = /^branch refs\/heads\/(.+)$/mu.exec(block)?.[1];
		if (path !== undefined && branch !== undefined) found.set(branch, path);
	}
	return found;
};

export const syncUnitsWithForge = async (
	input: IUnitForgeSyncInput,
): Promise<readonly IUnitForgeSync[]> => {
	const { run, runIn, policy, remote } = input;
	if (!policy.persistence.autoPushAfterCommit) return [];
	// The prefix names no placeholder, so resolving it yields the
	// qualified namespace the way every work ref is qualified.
	const local = resolveWorkRef(policy.branches.workRefPrefix, {
		agent: '',
		proposal: '',
		slice: '',
		generation: 0,
	});
	if (!local.startsWith('refs/heads/')) return [];
	const short = local.slice('refs/heads/'.length);
	if (short.length === 0) return [];
	const mirror = `refs/remotes/${remote}/${short}`;
	const fetched = await run([
		'fetch',
		'--quiet',
		remote,
		`+refs/heads/${short}*:${mirror}*`,
	]);
	if (!fetched.ok)
		return [
			{
				branch: `${short}*`,
				outcome: 'failed',
				detail: `could not fetch the units from ${remote}: ${fetched.reason ?? fetched.output}`,
			},
		];
	const mine = await refsUnder(run, local);
	const theirs = await refsUnder(run, mirror);
	const worktrees = await worktreesByBranch(run);
	const isAncestor = async (a: string, b: string): Promise<boolean> =>
		(await run(['merge-base', '--is-ancestor', a, b])).ok;
	const push = (branch: string) =>
		run([
			'push',
			'--quiet',
			remote,
			`refs/heads/${branch}:refs/heads/${branch}`,
		]);
	const synced: IUnitForgeSync[] = [];

	for (const [name, sha] of mine) {
		const branch = `${short}${name}`;
		const worktree = worktrees.get(branch);
		let tip = sha;
		// Edits nobody is making any more are work too: kept, then pushed.
		if (worktree !== undefined && !input.isLive(branch)) {
			const inTree = runIn(worktree);
			const dirty = await inTree(['status', '--porcelain']);
			if (dirty.ok && dirty.output.trim().length > 0) {
				const committed =
					(await inTree(['add', '-A'])).ok &&
					(
						await inTree([
							'commit',
							'--quiet',
							'-m',
							'chore(wip): keep the uncommitted work found at start',
						])
					).ok;
				if (!committed) {
					synced.push({
						branch,
						outcome: 'failed',
						detail: `${worktree} has uncommitted edits that could not be committed; they are still only on this machine`,
					});
					continue;
				}
				tip = (await inTree(['rev-parse', 'HEAD'])).output.trim();
				synced.push({ branch, outcome: 'kept-uncommitted' });
			}
		}
		const remoteTip = theirs.get(name);
		if (remoteTip === tip) continue;
		if (remoteTip === undefined || (await isAncestor(remoteTip, tip))) {
			const pushed = await push(branch);
			synced.push(
				pushed.ok
					? { branch, outcome: 'pushed' }
					: {
							branch,
							outcome: 'failed',
							detail: pushed.reason ?? pushed.output,
						},
			);
			continue;
		}
		if (await isAncestor(tip, remoteTip)) {
			const moved =
				worktree === undefined
					? await run([
							'update-ref',
							`refs/heads/${branch}`,
							remoteTip,
							tip,
						])
					: (
								await runIn(worktree)(['status', '--porcelain'])
							).output.trim().length > 0
						? {
								ok: false,
								output: 'its worktree has uncommitted edits',
							}
						: await runIn(worktree)([
								'merge',
								'--quiet',
								'--ff-only',
								remoteTip,
							]);
			synced.push(
				moved.ok
					? { branch, outcome: 'fast-forwarded' }
					: {
							branch,
							outcome: 'failed',
							detail: `${remote} is ahead, and the unit could not follow: ${moved.output}`,
						},
			);
			continue;
		}
		synced.push({
			branch,
			outcome: 'diverged',
			repair: `git -C <the unit's worktree> fetch ${remote} ${branch} && git merge FETCH_HEAD && git push ${remote} ${branch}`,
		});
	}
	for (const [name, sha] of theirs) {
		if (mine.has(name)) continue;
		const branch = `${short}${name}`;
		const created = await run([
			'update-ref',
			`refs/heads/${branch}`,
			sha,
			'',
		]);
		if (created.ok) synced.push({ branch, outcome: 'fetched' });
	}
	return synced;
};

/**
 * The start-up pass a server runs, reported on stderr (stdout is the MCP
 * transport). Never fails the start.
 */
export const syncUnitsAtStart = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly env?: NodeJS.ProcessEnv;
	readonly write?: (line: string) => void;
}): Promise<readonly IUnitForgeSync[]> => {
	const env = input.env ?? process.env;
	const write = input.write ?? ((line) => process.stderr.write(line));
	if (env[UNIT_FORGE_SYNC_VARIABLE] === 'off') return [];
	try {
		const run = createGitRunner(input.root);
		const remote = await resolveDurabilityRemote(run, undefined);
		if (remote === undefined) return [];
		const live = new Set(
			(
				await readUnitStandings({
					root: input.root,
					policy: input.policy,
				})
			)
				.filter((unit) => unit.standing === 'live')
				.map((unit) => unit.ref),
		);
		const synced = await syncUnitsWithForge({
			run,
			runIn: (cwd) => createGitRunner(cwd),
			policy: input.policy,
			remote,
			isLive: (branch) =>
				live.has(branch) || live.has(`refs/heads/${branch}`),
		});
		for (const each of synced)
			write(
				`[delendai] unit ${each.branch}: ${each.outcome}${each.detail === undefined ? '' : ` — ${each.detail}`}${each.repair === undefined ? '' : ` — reconcile with: ${each.repair}`}\n`,
			);
		return synced;
	} catch (error) {
		write(
			`[delendai] could not bring the units in step with the forge: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return [];
	}
};
