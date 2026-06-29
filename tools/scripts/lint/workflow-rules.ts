/**
 * workflow-rules.ts — f00049 S10 / SOLID refactor.
 *
 * Each workflow rule implements `IWorkflowRule.detect(ctx)` and
 * returns its findings. The composer (`workflow.script.ts`) iterates
 * the rules — open/closed: add a rule by appending to
 * `DEFAULT_WORKFLOW_RULES`, no edit to the composer.
 *
 * SRP — every rule owns one workflow-shape concern:
 *   - HandEditedIndexRule     → no commit may touch `index.json`.
 *   - PushFromMainRule        → `main` local head must not diverge from remote.
 *   - SyncRaceRule            → placeholder for MCP-telemetry future work.
 *   - AutoWorkLoopRule        → placeholder for MCP-telemetry future work.
 *
 * DIP — the composer depends on the `IWorkflowRule` interface and the
 * `IWorkflowContext` interface. Tests inject a fake context (no real
 * git, no real working dir).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type WorkflowRuleId =
	| 'hand-edited-index'
	| 'sync-race'
	| 'auto-work-loop'
	| 'push-from-main';

export interface IWorkflowFinding {
	readonly rule: WorkflowRuleId;
	readonly detail: string;
}

/** Read-only context the rules consume. `exec` is injected so tests
 *  can swap a fake command runner without touching the rules. */
export interface IWorkflowContext {
	readonly rootDir: string;
	readonly recentCommits: readonly ICommitInfo[];
	readonly upstream: { localHead: string; remoteHead: string } | null;
	readonly exec: (argv: readonly string[]) => Promise<string>;
}

export interface ICommitInfo {
	readonly hash: string;
	readonly author: string;
	readonly iso: string;
	readonly subject: string;
	readonly files: readonly string[];
}

export interface IWorkflowRule {
	readonly id: WorkflowRuleId;
	readonly detect: (ctx: IWorkflowContext) => readonly IWorkflowFinding[];
}

const PROPOSAL_INDEX_PATH = 'docs/mcp-vertex/proposals/index.json';
const WORKFLOW_LINT_ENFORCEMENT_EPOCH_MS = Date.parse(
	'2026-06-24T00:00:00+02:00',
);

const isDedicatedProposalIndexRefresh = (commit: ICommitInfo): boolean =>
	commit.files.length === 1 &&
	commit.files[0] === PROPOSAL_INDEX_PATH &&
	/^chore: refresh proposals index$/i.test(commit.subject.trim());

const isBeforeWorkflowLintEnforcement = (commit: ICommitInfo): boolean => {
	const ms = Date.parse(commit.iso);
	return Number.isFinite(ms) && ms < WORKFLOW_LINT_ENFORCEMENT_EPOCH_MS;
};

/** Rule 1 — no mixed commit may touch `docs/mcp-vertex/proposals/index.json`.
 *  Dedicated generated refresh commits are allowed; mixed edits are
 *  the risky workflow shape because reviewers cannot tell whether the
 *  index was regenerated after the proposal change or hand-edited.
 *  Historical commits before this lint was enforced are intentionally
 *  out of scope; otherwise the report can never become clean without
 *  rewriting repository history. */
export const HandEditedIndexRule: IWorkflowRule = {
	id: 'hand-edited-index',
	detect: (ctx) => {
		const findings: IWorkflowFinding[] = [];
		for (const commit of ctx.recentCommits) {
			if (isBeforeWorkflowLintEnforcement(commit)) continue;
			if (
				commit.files.includes(PROPOSAL_INDEX_PATH) &&
				!isDedicatedProposalIndexRefresh(commit)
			) {
				findings.push({
					rule: 'hand-edited-index',
					detail: `commit ${commit.hash.slice(0, 12)} by ${commit.author} touched docs/mcp-vertex/proposals/index.json with other changes — regenerate the index in a dedicated refresh commit`,
				});
				break;
			}
		}
		return findings;
	},
};

/** Rule 2 — local `main` head must not diverge from its upstream.
 *  Push from `main` should be agent_worktree-only. */
export const PushFromMainRule: IWorkflowRule = {
	id: 'push-from-main',
	detect: (ctx) => {
		if (!ctx.upstream) return [];
		const { localHead, remoteHead } = ctx.upstream;
		if (localHead !== remoteHead) {
			return [
				{
					rule: 'push-from-main',
					detail: `main local=${localHead.slice(0, 12)} remote=${remoteHead.slice(0, 12)} — push from main should be agent_worktree-only`,
				},
			];
		}
		return [];
	},
};

/** Rule 3 — placeholder for the sync-race heuristic. The real
 *  enforcement requires cross-referencing `mcp-vertex_proposals_sync_proposals`
 *  MCP invocations against slice-close timestamps; that telemetry is
 *  not yet exported by the proposals plugin (post-f00049 follow-up).
 *
 *  Until that telemetry exists the rule detects nothing: a placeholder
 *  must not turn the gate red. It stays in the chain (open/closed) so
 *  the follow-up only swaps the body, not the wiring. */
export const SyncRaceRule: IWorkflowRule = {
	id: 'sync-race',
	detect: () => [],
};

/** Rule 4 — placeholder for the auto-work-loop heuristic. Same gap as
 *  SyncRaceRule; the real enforcement arrives with the proposals
 *  plugin's runtime telemetry. Detects nothing until then. */
export const AutoWorkLoopRule: IWorkflowRule = {
	id: 'auto-work-loop',
	detect: () => [],
};

/** Default rule set, ordered by perceived severity (most actionable first). */
export const DEFAULT_WORKFLOW_RULES: readonly IWorkflowRule[] = [
	HandEditedIndexRule,
	PushFromMainRule,
	SyncRaceRule,
	AutoWorkLoopRule,
];

/* ------------------------------------------------------------------ *
 *  Context gathering — kept in this module so the script stays thin.  *
 * ------------------------------------------------------------------ */

const parseCommits = (raw: string): readonly ICommitInfo[] => {
	const blocks = raw.split('\n\n');
	const commits: ICommitInfo[] = [];
	for (const block of blocks) {
		const headerMatch = block.match(
			/^([0-9a-f]+)\|([^|]*)\|([^|]*)\|(.*)$/m,
		);
		if (!headerMatch) continue;
		const [, hash, author, iso, subject] = headerMatch;
		if (!hash || !author || !iso || !subject) continue;
		const files = block
			.split('\n')
			.slice(1)
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
		commits.push({ hash, author, iso, subject, files });
	}
	return commits;
};

const gatherUpstream = async (
	execFn: (argv: readonly string[]) => Promise<string>,
): Promise<{ localHead: string; remoteHead: string } | null> => {
	try {
		const head = (await execFn(['symbolic-ref', 'HEAD'])).trim();
		const upstream = (
			await execFn(['rev-parse', '--abbrev-ref', `${head}@{upstream}`])
		).trim();
		const localHead = (await execFn(['rev-parse', head])).trim();
		const remoteHead = (await execFn(['rev-parse', upstream])).trim();
		return { localHead, remoteHead };
	} catch {
		return null;
	}
};

const realExec =
	(cwd: string) =>
	async (argv: readonly string[]): Promise<string> => {
		const { stdout } = await exec('git', [...argv], {
			cwd,
			maxBuffer: 16 * 1024 * 1024,
		});
		return stdout;
	};

/** Build a workflow context from a live working directory. */
export const gatherContext = async (
	rootDir: string,
	depth = 50,
): Promise<IWorkflowContext> => {
	const execFn = realExec(rootDir);
	const log = await execFn([
		'log',
		'--name-only',
		'--pretty=format:%H|%an|%aI|%s',
		`-${depth}`,
	]);
	const recentCommits = parseCommits(log);
	const upstream = await gatherUpstream(execFn);
	return {
		rootDir,
		recentCommits,
		upstream,
		exec: execFn,
	};
};
