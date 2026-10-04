// effect-boundary-authorized: swarm validation provider only reads JSON snapshots from the proposals directory (read-only adapter)
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';

import { callerCheckout } from '@delendai/core/public';
import {
	resolveScopedValidationDecision,
	type IScopeMap,
	type IScopedValidationDecision,
} from '@delendai/quality/public';

import type { IWorkRefShape } from '../contracts/interfaces/review-attribution.interface';
import { parseWorktreeList } from '../agents/agent-worktree-engine';
import { coerceHost } from '../shared/agent-identity';
import {
	isUnderPrefixes,
	managedBranchPrefixes,
} from '../shared/branch-namespaces';
import { createGitRunner } from '../shared/git-runner';
import { canonicalTaskId, resolveCloseActor } from './close-actor.resolver';
import { resolveValidationActivitySnapshot } from './validation-activity.resolver';
import type {
	IValidationActivitySource,
	IValidationLockEntry,
	IValidationRegistryEntry,
	IValidationWorktreeEntry,
} from './validation-activity.types';

/** A claim's task id in the one spelling the gate compares. */
const withCanonicalTask = <T extends { readonly task_id?: string }>(
	entry: T,
): T =>
	typeof entry.task_id === 'string'
		? { ...entry, task_id: canonicalTaskId(entry.task_id) }
		: entry;

const readRegistry = async (
	path: string,
): Promise<IValidationActivitySource<IValidationRegistryEntry>> => {
	try {
		const raw = await readFile(path, 'utf8');
		try {
			const parsed = JSON.parse(raw) as {
				assignments?: readonly IValidationRegistryEntry[];
			};
			return {
				state: 'ok',
				...(Array.isArray(parsed.assignments)
					? { entries: parsed.assignments.map(withCanonicalTask) }
					: {}),
			};
		} catch {
			return { state: 'corrupt' };
		}
	} catch {
		return { state: 'missing' };
	}
};

/**
 * Extracts the `in_flight` array shape from the read/joined locks
 * source, mirroring `readRegistry`'s handling of `assignments` —
 * kept as its own function so the two sources share one code path
 * for the error semantics (the shingle detector treats the inlined
 * twin branch as cross-file duplication).
 */
const readLocksInner = (
	raw: string,
): IValidationActivitySource<IValidationLockEntry> => {
	const parsed = JSON.parse(raw) as {
		in_flight?: readonly IValidationLockEntry[];
	};
	return {
		state: 'ok',
		...(Array.isArray(parsed.in_flight)
			? { entries: parsed.in_flight.map(withCanonicalTask) }
			: {}),
	};
};

const readLocks = async (
	path: string,
): Promise<IValidationActivitySource<IValidationLockEntry>> => {
	try {
		const raw = await readFile(path, 'utf8');
		return readLocksInner(raw);
	} catch (error) {
		if (error instanceof SyntaxError) return { state: 'corrupt' };
		return { state: 'missing' };
	}
};

const isInsideDirectory = (path: string, directory: string): boolean => {
	const relation = relative(directory, path);
	return (
		relation !== '' && !relation.startsWith('..') && !isAbsolute(relation)
	);
};

/**
 * Only worktrees delendai manages are evidence of agent activity: those
 * under its worktrees directory or on a branch in the swarm's namespaces.
 * A scratch checkout, a bisect or a CI helper is somebody else's.
 */
export const selectManagedWorktrees = (
	entries: readonly IValidationWorktreeEntry[],
	managed: {
		readonly worktreesDirAbs: string;
		readonly branchPrefixes: readonly string[];
	},
): readonly IValidationWorktreeEntry[] =>
	entries.filter(
		(entry) =>
			(entry.path !== undefined &&
				isInsideDirectory(entry.path, managed.worktreesDirAbs)) ||
			(entry.branch !== undefined &&
				isUnderPrefixes(entry.branch, managed.branchPrefixes)),
	);

export const buildCloseSliceValidationProvider = (input: {
	readonly workspaceRoot: string;
	readonly registryPathAbs: string;
	readonly lockPathAbs: string;
	readonly worktreesDirAbs: string;
	readonly scopes: IScopeMap;
	readonly host?: string;
	readonly model?: string;
	/** The project's work-ref shape; absent when it names no work refs. */
	readonly branches?: IWorkRefShape | undefined;
	/** `DELENDAI_AGENT_ID`, injectable for tests. */
	readonly environmentAgent?: string | undefined;
}): ((args: {
	readonly operation: 'close';
	readonly ownedFiles: readonly string[];
	readonly proposalId: string;
	readonly sliceId: string;
	readonly agent?: string | undefined;
}) => Promise<IScopedValidationDecision>) => {
	const run = createGitRunner(input.workspaceRoot);
	return async ({ ownedFiles, proposalId, sliceId, agent }) => {
		const compositeTaskId = canonicalTaskId(`${proposalId}-${sliceId}`);
		const [registry, locks, worktreeResult, currentBranch] =
			await Promise.all([
				readRegistry(input.registryPathAbs),
				readLocks(input.lockPathAbs),
				run(['worktree', 'list', '--porcelain']),
				run(['branch', '--show-current']),
			]);
		const worktreeEntries: readonly IValidationWorktreeEntry[] =
			worktreeResult.ok
				? selectManagedWorktrees(
						parseWorktreeList(worktreeResult.output).map(
							(entry) => ({
								...(entry.branch !== undefined
									? { branch: entry.branch }
									: {}),
								path: entry.path,
							}),
						),
						{
							worktreesDirAbs: input.worktreesDirAbs,
							branchPrefixes: await managedBranchPrefixes(
								input.workspaceRoot,
							),
						},
					)
				: [];
		const branch =
			currentBranch.ok && currentBranch.output.trim() !== ''
				? currentBranch.output.trim()
				: undefined;
		const checkout = callerCheckout.executionRootOr(input.workspaceRoot);
		const actor = resolveCloseActor({
			agent,
			environment:
				'environmentAgent' in input
					? input.environmentAgent
					: process.env['DELENDAI_AGENT_ID'],
			branch,
			shape: input.branches,
			proposalId,
			sliceId,
		});
		const nowIso = new Date().toISOString();
		// Being in one's own unit is proof of activity: the unit's owner is
		// at work on its slices without a separate claim.
		const unitEntries: readonly IValidationWorktreeEntry[] =
			actor.ownsUnit &&
			actor.unit !== undefined &&
			actor.agent !== undefined
				? [
						{
							branch: actor.unit.branch,
							path: checkout,
							taskId: compositeTaskId,
							agentName: actor.agent,
							lastSeen: nowIso,
						},
					]
				: [];
		const activity = resolveValidationActivitySnapshot({
			now: nowIso,
			current: {
				taskId: compositeTaskId,
				...(actor.agent !== undefined
					? { agentName: actor.agent }
					: {}),
				...(coerceHost(input.host) !== null
					? { host: coerceHost(input.host)! }
					: {}),
				...(input.model !== undefined && input.model !== ''
					? { model: input.model }
					: {}),
				...(branch !== undefined ? { branch } : {}),
			},
			registry,
			locks,
			worktrees:
				worktreeResult.ok === true
					? {
							state: 'ok',
							entries: [...worktreeEntries, ...unitEntries],
						}
					: { state: 'missing' },
		});
		const decision = resolveScopedValidationDecision({
			operation: 'close',
			ownedFiles,
			scopes: input.scopes,
			activity,
		});
		if (decision.mode !== 'blocked') return decision;
		const holder = activity.agents.find(
			(candidate) => candidate.taskId === compositeTaskId,
		);
		const claim =
			holder === undefined
				? 'none'
				: `${holder.state} (held by ${holder.agentName ?? 'unknown'})`;
		return {
			...decision,
			blockingReasons: [
				...decision.blockingReasons,
				`resolved actor: ${actor.agent ?? 'none'} (from ${actor.source}); unit: ${actor.unit === undefined ? 'checkout is not a work unit' : `${actor.unit.branch}${actor.ownsUnit ? ' (own, for this slice)' : " (not this actor's unit for this slice)"}`}`,
				`claim for ${compositeTaskId}: ${claim}`,
				`read: locks ${input.lockPathAbs} (${activity.sourceStates.lock}), registry ${input.registryPathAbs} (${activity.sourceStates.registry})`,
			],
		};
	};
};
