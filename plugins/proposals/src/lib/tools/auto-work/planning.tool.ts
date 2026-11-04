// effect-boundary-authorized: read-only stat of an artifact a proposal declares, to tell whether it exists on disk; nothing is written.
import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import { runContinueProposal } from '../continue-proposal.tool';
import type { IAutoWorkPersistMode } from '../auto-work-persist';
import { createGitRunner } from '../../shared/git-runner';
import { hasPeerApprovedReview } from '../../swarm/proposal-review';
import { readProposalIndex } from '../../proposals/index-reader';
import type {
	IAutoWorkToolOptions,
	IIdleStreak,
	IAutoWorkOrchestrationPolicy,
	IContinueProposalPlanPayload,
	IClaimReadyResolution,
} from '../../contracts/interfaces/auto-work-tool.interface';
import { DEFAULT_DELEGATE_AFTER_TOOL_CALLS } from '../../contracts/constants/auto-work-tool.constant';

export const persistTargetHitsProtectedBranch = (
	pushTarget: string,
	protectedBranches: readonly string[] = ['main', 'master'],
): boolean => {
	const tokens = pushTarget.split(/\s+/u);
	return tokens.some((token) =>
		protectedBranches.some(
			(branch) =>
				token === branch ||
				token.endsWith(`/${branch}`) ||
				token.endsWith(`\\${branch}`) ||
				token.endsWith(`:${branch}`) ||
				token.endsWith(`:/${branch}`),
		),
	);
};

/**
 * Concrete `IIdleStreak` factory. The previous implementation used a
 * module-scope `let consecutiveIdle = 0`, which leaked across vitest
 * files importing the same module and across two `auto_work`
 * registrations in the same process. Each `buildAutoWorkRegistration`
 * call now owns its own counter and passes it into `runAutoWork` via
 * `IAutoWorkToolOptions.idleStreak`.
 */
export const createIdleStreak = (): IIdleStreak => {
	let count = 0;
	return {
		get count() {
			return count;
		},
		reset() {
			count = 0;
		},
		increment() {
			count += 1;
			return count;
		},
	};
};

const lacksPeerApproval = async (
	proposalsDirAbs: string,
	file: string,
): Promise<boolean> => {
	try {
		const raw = (
			await new SafeWorkspaceReader(proposalsDirAbs).readText(file)
		).content;
		return !hasPeerApprovedReview(raw);
	} catch {
		// A review file that cannot be read is no candidate for this check.
		return false;
	}
};

export const findReviewPendingPeerApproval = async (
	options: Pick<IAutoWorkToolOptions, 'indexPathAbs' | 'proposalsDirAbs'>,
): Promise<{ proposalId: string; file: string } | null> => {
	if (options.proposalsDirAbs === undefined) return null;
	for (const entry of await readProposalIndex(options.indexPathAbs)) {
		if (
			(entry.file.startsWith('review/') ||
				entry.file.includes('/review/')) &&
			(await lacksPeerApproval(options.proposalsDirAbs, entry.file))
		) {
			return { proposalId: entry.id, file: entry.file };
		}
	}
	return null;
};

const hasTrackedArtifact = async (
	workspaceRoot: string,
	file: string,
): Promise<boolean> => {
	const abs = resolve(workspaceRoot, file);
	const rel = relative(workspaceRoot, abs);
	if (rel.startsWith('..') || rel === '..') return false;
	try {
		await stat(abs);
	} catch {
		return false;
	}
	const git = await createGitRunner(workspaceRoot)([
		'ls-files',
		'--error-unmatch',
		'--',
		file,
	]);
	return git.ok && git.output.trim() !== '';
};

const hasPendingArtifactChange = async (
	workspaceRoot: string,
	file: string,
): Promise<boolean> => {
	const abs = resolve(workspaceRoot, file);
	const rel = relative(workspaceRoot, abs);
	if (rel.startsWith('..') || rel === '..') return false;
	try {
		await stat(abs);
	} catch {
		return false;
	}
	const git = await createGitRunner(workspaceRoot)([
		'status',
		'--porcelain=v1',
		'--untracked-files=all',
		'--',
		file,
	]);
	return git.ok && git.output.trim() !== '';
};

/**
 * Resolve the first claimable slice through the existing planner instead of
 * duplicating its dependency and overlap rules in `auto_work`. A legacy
 * proposal without a `## Slices` plan remains a valid serial work response,
 * just without a claim-ready shortcut.
 */
export const resolveClaimReady = async (
	proposalId: string,
	options: IAutoWorkToolOptions,
): Promise<IClaimReadyResolution> => {
	const response = await runContinueProposal(
		{ proposalId, mode: 'plan' },
		options,
	);
	const payload = JSON.parse(
		response.content[0]?.text ?? '{}',
	) as IContinueProposalPlanPayload;
	if (payload.kind !== 'slice-plan') {
		return { missingDoneArtifacts: [], pendingTrackedArtifacts: [] };
	}
	const doneSlices = payload.plan?.slices.filter(
		(slice) => slice.status === 'done',
	);
	const missingDoneArtifacts =
		options.workspaceRoot === undefined
			? []
			: (
					await Promise.all(
						(doneSlices ?? []).flatMap(async (slice) =>
							(
								await Promise.all(
									slice.files.map(async (file) => ({
										file,
										exists: await hasTrackedArtifact(
											options.workspaceRoot!,
											file,
										),
									})),
								)
							)
								.filter((artifact) => !artifact.exists)
								.map(
									(artifact) =>
										`${slice.sliceId}: ${artifact.file}`,
								),
						),
					)
				).flat();
	const sliceId = payload.claimableSliceIds?.[0];
	if (sliceId === undefined) {
		return { missingDoneArtifacts, pendingTrackedArtifacts: [] };
	}
	const slice = payload.plan?.slices.find(
		(candidate) => candidate.sliceId === sliceId,
	);
	if (slice === undefined || slice.files.length === 0) {
		return { missingDoneArtifacts, pendingTrackedArtifacts: [] };
	}
	const pendingTrackedArtifacts =
		options.workspaceRoot === undefined || slice.status !== 'pending'
			? []
			: !slice.files.some((file) => !file.endsWith('.md'))
				? []
				: (
							await Promise.all(
								slice.files.map(async (file) => ({
									file,
									exists: await hasPendingArtifactChange(
										options.workspaceRoot!,
										file,
									),
								})),
							)
						).every((artifact) => artifact.exists)
					? slice.files.map((file) => `${slice.sliceId}: ${file}`)
					: [];
	if (pendingTrackedArtifacts.length > 0) {
		return { missingDoneArtifacts, pendingTrackedArtifacts };
	}
	return {
		missingDoneArtifacts,
		pendingTrackedArtifacts,
		claimReady: {
			sliceId,
			files: [...slice.files],
			gate: slice.gate,
			agent_lock_args: {
				action: 'claim',
				task_id: `${proposalId}-${sliceId}`,
				agent: '<host-resolved-agent>',
				files: [...slice.files],
			},
		},
	};
};

export const buildPeerReviewPlan = (input: {
	readonly namespacePrefix: string;
	readonly proposalId: string;
	readonly file: string;
	readonly persistMode?: IAutoWorkPersistMode;
}) => ({
	state: 'work' as const,
	proposalId: input.proposalId,
	file: input.file,
	persist: { mode: input.persistMode ?? 'none' },
	next: `${input.namespacePrefix}_proposal_review`,
	nextAction: `Peer-review gate (F149). Call ${input.namespacePrefix}_proposal_review { action: "approve", proposalId: "${input.proposalId}", sliceId: "<finished-slice>", agent: "<reviewer≠implementer>" } before ${input.namespacePrefix}_proposal_transition { id: "${input.proposalId}", to: "done", reason } .`,
	steps: [
		`Open ${input.file} and identify finished slices awaiting review.`,
		`Peer-review gate (F149): run ${input.namespacePrefix}_proposal_review { action: "approve" | "request_changes", proposalId: "${input.proposalId}", sliceId, agent: "<reviewer≠implementer>" } for each finished slice before done.`,
		`Only after an independent approve is logged: ${input.namespacePrefix}_proposal_transition { id: "${input.proposalId}", to: "done", reason }.`,
		`Repeat ${input.namespacePrefix}_auto_work.`,
	],
});

export const buildAutoWorkOrchestrationPolicy = (options: {
	readonly namespacePrefix: string;
	readonly proposalId: string;
	readonly delegateAfterToolCalls?: number | undefined;
}): IAutoWorkOrchestrationPolicy => {
	const delegateAfterToolCalls =
		options.delegateAfterToolCalls ?? DEFAULT_DELEGATE_AFTER_TOOL_CALLS;
	return {
		lane: 'inspect-then-delegate',
		delegateAfterToolCalls,
		next: `${options.namespacePrefix}_continue_proposal { proposalId: "${options.proposalId}", mode: "plan" }`,
		policy: `Keep the main thread to auto_work/plan/delegate. If the slice needs >${delegateAfterToolCalls} tool calls, multiple files, or repeated MCP reads, delegate it instead of doing the research here.`,
	};
};
