import type {
	IAgentSession,
	IAgentSessionDerivationInput,
	IAgentSessionLockSnapshot,
	IAgentSessionProposalSummary,
	IAgentSessionWorktreeSnapshot,
} from '../contracts/interfaces/agent-session.interface';

/**
 * The `agent_worktree` namespace. A project whose units of work live under
 * another prefix names it in the derivation input.
 */
const DEFAULT_AGENT_BRANCH_PREFIXES: readonly string[] = ['agent/'];

/** The prefix `branch` sits under, or nothing. */
const prefixOf = (
	branch: string | undefined,
	prefixes: readonly string[],
): string | undefined =>
	branch === undefined
		? undefined
		: prefixes.find((prefix) => branch.startsWith(prefix));

const slugify = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+/u, '')
		.replace(/-+$/u, '');

const normalizeBranch = (branch: string | undefined): string | undefined => {
	if (branch === undefined) return undefined;
	return branch.startsWith('refs/heads/')
		? branch.slice('refs/heads/'.length)
		: branch;
};

const unique = (values: readonly string[]): readonly string[] => [
	...new Set(values),
];

const compareSessions = (left: IAgentSession, right: IAgentSession): number => {
	const leftKey = `${left.agent}\u0000${left.taskId ?? ''}\u0000${left.worktree ?? ''}`;
	const rightKey = `${right.agent}\u0000${right.taskId ?? ''}\u0000${right.worktree ?? ''}`;
	return leftKey.localeCompare(rightKey);
};

const buildSessionId = (
	agent: string,
	taskId: string | undefined,
	worktree: string | undefined,
	branch: string | undefined,
): string => {
	const taskPart = taskId?.trim();
	if (taskPart !== undefined && taskPart.length > 0) {
		return `${agent}:${taskPart}`;
	}
	const branchPart = branch?.trim();
	if (branchPart !== undefined && branchPart.length > 0) {
		return `${agent}:${branchPart}`;
	}
	return `${agent}:${worktree ?? 'session'}`;
};

const resolveProposalForTaskId = (
	taskId: string | undefined,
	proposals: readonly IAgentSessionProposalSummary[],
): IAgentSessionProposalSummary | undefined => {
	if (taskId === undefined || taskId.trim().length === 0) return undefined;

	const exact = proposals.find((proposal) => proposal.id === taskId);
	if (exact !== undefined) return exact;

	return proposals
		.filter((proposal) => taskId.startsWith(`${proposal.id}-`))
		.sort((left, right) => right.id.length - left.id.length)[0];
};

const scoreWorktreeMatch = (
	lock: IAgentSessionLockSnapshot,
	worktree: IAgentSessionWorktreeSnapshot,
	prefixes: readonly string[],
): number => {
	const branch = normalizeBranch(worktree.branch);
	const prefix = prefixOf(branch, prefixes);
	if (branch === undefined || prefix === undefined) {
		return -1;
	}

	const branchSlug = branch.slice(prefix.length);
	const agentSlug = slugify(lock.agent);
	const taskSlug = slugify(lock.task_id);

	if (branchSlug === agentSlug) return 4;
	if (
		taskSlug.length > 0 &&
		branchSlug.endsWith(`-${taskSlug}`) &&
		branchSlug.includes(`-${agentSlug}-`)
	) {
		return 3;
	}
	if (branchSlug.includes(`-${agentSlug}-`)) return 2;
	if (branchSlug.endsWith(`-${agentSlug}`)) return 1;
	return -1;
};

const takeBestMatchingWorktree = (
	lock: IAgentSessionLockSnapshot,
	worktrees: readonly IAgentSessionWorktreeSnapshot[],
	usedIndexes: Set<number>,
	prefixes: readonly string[],
): IAgentSessionWorktreeSnapshot | undefined => {
	let bestIndex = -1;
	let bestScore = -1;

	for (const [index, worktree] of worktrees.entries()) {
		if (usedIndexes.has(index)) continue;
		const score = scoreWorktreeMatch(lock, worktree, prefixes);
		if (score > bestScore) {
			bestScore = score;
			bestIndex = index;
		}
	}

	if (bestIndex === -1) return undefined;
	usedIndexes.add(bestIndex);
	return worktrees[bestIndex];
};

const worktreeBranchAgent = (
	worktree: IAgentSessionWorktreeSnapshot,
	prefixes: readonly string[],
): string | undefined => {
	const branch = normalizeBranch(worktree.branch);
	const prefix = prefixOf(branch, prefixes);
	if (branch === undefined || prefix === undefined) {
		return undefined;
	}
	return branch.slice(prefix.length);
};

const sessionFromLock = (
	lock: IAgentSessionLockSnapshot,
	worktree: IAgentSessionWorktreeSnapshot | undefined,
	proposal: IAgentSessionProposalSummary | undefined,
): IAgentSession => {
	const branch = normalizeBranch(worktree?.branch);
	return {
		id: buildSessionId(lock.agent, lock.task_id, worktree?.path, branch),
		agent: lock.agent,
		taskId: lock.task_id,
		...(proposal !== undefined ? { proposal } : {}),
		...(worktree?.path !== undefined ? { worktree: worktree.path } : {}),
		...(branch !== undefined ? { branch } : {}),
		...(worktree?.head !== undefined
			? { currentCommit: worktree.head }
			: {}),
		...(proposal?.status !== undefined ? { status: proposal.status } : {}),
		lastActivity: lock.last_seen,
		modifiedFiles: unique(lock.ownership),
		...(worktree !== undefined
			? {
					detached: worktree.detached,
					locked: worktree.locked,
				}
			: {}),
	};
};

const sessionFromWorktree = (
	worktree: IAgentSessionWorktreeSnapshot,
	prefixes: readonly string[],
): IAgentSession | undefined => {
	const agent = worktreeBranchAgent(worktree, prefixes);
	const branch = normalizeBranch(worktree.branch);
	if (agent === undefined || branch === undefined) return undefined;

	return {
		id: buildSessionId(agent, undefined, worktree.path, branch),
		agent,
		worktree: worktree.path,
		branch,
		currentCommit: worktree.head,
		modifiedFiles: [],
		detached: worktree.detached,
		locked: worktree.locked,
	};
};

export const deriveAgentSessions = (
	input: IAgentSessionDerivationInput,
): readonly IAgentSession[] => {
	const prefixes = input.branchPrefixes ?? DEFAULT_AGENT_BRANCH_PREFIXES;
	const usedWorktrees = new Set<number>();
	const sessions: IAgentSession[] = [];

	for (const lock of input.locks) {
		const worktree = takeBestMatchingWorktree(
			lock,
			input.worktrees,
			usedWorktrees,
			prefixes,
		);
		const proposal = resolveProposalForTaskId(
			lock.task_id,
			input.proposals,
		);
		sessions.push(sessionFromLock(lock, worktree, proposal));
	}

	for (const [index, worktree] of input.worktrees.entries()) {
		if (usedWorktrees.has(index)) continue;
		const session = sessionFromWorktree(worktree, prefixes);
		if (session !== undefined) sessions.push(session);
	}

	return sessions.sort(compareSessions);
};
