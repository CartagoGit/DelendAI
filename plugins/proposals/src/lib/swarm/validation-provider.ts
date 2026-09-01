// effect-boundary-authorized: swarm validation provider only reads JSON snapshots from the proposals directory (read-only adapter)
import { readFile } from 'node:fs/promises';

import {
	resolveScopedValidationDecision,
	type IScopeMap,
	type IScopedValidationDecision,
} from '@mcp-vertex/quality/public';

import { parseWorktreeList } from '../agents/agent-worktree-engine';
import { coerceHost } from '../shared/agent-identity';
import { createGitRunner } from '../shared/git-runner';
import { resolveValidationActivitySnapshot } from './validation-activity.resolver';
import type {
	IValidationActivitySource,
	IValidationLockEntry,
	IValidationRegistryEntry,
	IValidationWorktreeEntry,
} from './validation-activity.types';

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
					? { entries: parsed.assignments }
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
			? { entries: parsed.in_flight }
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

export const buildCloseSliceValidationProvider = (input: {
	readonly workspaceRoot: string;
	readonly registryPathAbs: string;
	readonly lockPathAbs: string;
	readonly worktreesDirAbs: string;
	readonly scopes: IScopeMap;
	readonly host?: string;
	readonly model?: string;
}): ((args: {
	readonly operation: 'close';
	readonly ownedFiles: readonly string[];
	readonly proposalId: string;
	readonly sliceId: string;
}) => Promise<IScopedValidationDecision>) => {
	const run = createGitRunner(input.workspaceRoot);
	return async ({ ownedFiles, proposalId, sliceId }) => {
		const compositeTaskId = `${proposalId}-${sliceId.toUpperCase()}`;
		const [registry, locks, worktreeResult, currentBranch] =
			await Promise.all([
				readRegistry(input.registryPathAbs),
				readLocks(input.lockPathAbs),
				run(['worktree', 'list', '--porcelain']),
				run(['branch', '--show-current']),
			]);
		const worktreeEntries: IValidationWorktreeEntry[] = worktreeResult.ok
			? parseWorktreeList(worktreeResult.output).map((entry) => ({
					...(entry.branch !== undefined
						? { branch: entry.branch }
						: {}),
					path: entry.path,
				}))
			: [];
		const activity = resolveValidationActivitySnapshot({
			current: {
				taskId: compositeTaskId,
				...(coerceHost(input.host) !== null
					? { host: coerceHost(input.host)! }
					: {}),
				...(input.model !== undefined && input.model !== ''
					? { model: input.model }
					: {}),
				...(currentBranch.ok && currentBranch.output.trim() !== ''
					? { branch: currentBranch.output.trim() }
					: {}),
			},
			registry,
			locks,
			worktrees:
				worktreeResult.ok === true
					? { state: 'ok', entries: worktreeEntries }
					: { state: 'missing' },
		});
		return resolveScopedValidationDecision({
			operation: 'close',
			ownedFiles,
			scopes: input.scopes,
			activity,
		});
	};
};
