import { createGitRunner } from '../shared/git-runner';
import {
	type IStrandedBranch,
	detectStrandedBranches,
} from '../tools/branch-status.tool';

export interface IPurgeStrandedBranchesDeps {
	readonly workspaceRoot: string;
	readonly listAgentBranches?: (
		cwd: string,
	) => Promise<readonly IStrandedBranch[]>;
	readonly runGit?: (
		args: readonly string[],
	) => Promise<{ ok: boolean; output: string; code: number }>;
	readonly thresholdBehind?: number;
	readonly dryRun?: boolean;
	readonly now?: () => number;
}

export interface IPurgeStrandedBranchesResult {
	readonly dryRun: boolean;
	readonly candidates: readonly IStrandedBranch[];
	readonly deleted: readonly string[];
	readonly skipped: readonly { branch: string; reason: string }[];
}

const defaultRunGit =
	(workspaceRoot: string) =>
	async (
		args: readonly string[],
	): Promise<{ ok: boolean; output: string; code: number }> => {
		const result = await createGitRunner(workspaceRoot)(args);
		return {
			ok: result.ok,
			output: result.ok
				? result.output
				: (result.reason ?? result.output),
			code: result.ok ? 0 : 1,
		};
	};

export const purgeStrandedBranches = async (
	deps: IPurgeStrandedBranchesDeps,
): Promise<IPurgeStrandedBranchesResult> => {
	const dryRun = deps.dryRun ?? true;
	const thresholdBehind = deps.thresholdBehind ?? 10;
	const runGit = deps.runGit ?? defaultRunGit(deps.workspaceRoot);
	const candidates = await detectStrandedBranches({
		...(deps.listAgentBranches !== undefined
			? { listAgentBranches: deps.listAgentBranches }
			: {}),
		...(deps.now !== undefined ? { now: deps.now } : {}),
		thresholdBehind,
	});
	const deleted: string[] = [];
	const skipped: Array<{ branch: string; reason: string }> = [];

	for (const candidate of candidates) {
		if (candidate.worktreePath !== null) {
			skipped.push({
				branch: candidate.branch,
				reason: `branch still has a registered worktree at ${candidate.worktreePath}`,
			});
			continue;
		}
		if (dryRun) continue;
		const result = await runGit(['branch', '-D', candidate.branch]);
		if (result.ok) {
			deleted.push(candidate.branch);
			continue;
		}
		skipped.push({
			branch: candidate.branch,
			reason:
				result.output.trim().split('\n')[0] ||
				`git branch -D failed with code ${result.code}`,
		});
	}

	return {
		dryRun,
		candidates,
		deleted,
		skipped,
	};
};
