// effect-boundary-authorized: swarm validation provider only reads JSON snapshots from the proposals directory (read-only adapter)
import { readFile } from 'node:fs/promises';

import type { AgentHost } from '@mcp-vertex/core/public';
import {
	resolveScopedValidationDecision,
	type IScopeMap,
	type IScopedValidationDecision,
} from '@mcp-vertex/quality/public';

import { parseWorktreeList } from '../agents/agent-worktree-engine';
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

const readLocks = async (
	path: string,
): Promise<IValidationActivitySource<IValidationLockEntry>> => {
	try {
		const raw = await readFile(path, 'utf8');
		try {
			const parsed = JSON.parse(raw) as {
				in_flight?: readonly IValidationLockEntry[];
			};
			return {
				state: 'ok',
				...(Array.isArray(parsed.in_flight)
					? { entries: parsed.in_flight }
					: {}),
			};
		} catch {
			return { state: 'corrupt' };
		}
	} catch {
		return { state: 'missing' };
	}
};

/** Known hosts — mirrors the closed `AgentHost` union in core. */
const KNOWN_HOSTS = [
	'vscode-copilot',
	'claude-code',
	'codex-cli',
	'cursor',
	'aider',
	'continue',
	'unknown',
] as const;

/** Coerce the raw host string the core resolves into the closed union. */
const coerceHost = (raw: string | undefined): AgentHost | null => {
	if (raw === undefined) return null;
	return (KNOWN_HOSTS as readonly string[]).includes(raw)
		? (raw as AgentHost)
		: 'unknown';
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
