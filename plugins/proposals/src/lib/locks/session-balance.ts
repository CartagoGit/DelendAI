/**
 * session-balance.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockArgs,
	IAgentLockDeps,
	IAgentLockResponse,
} from '../contracts/interfaces/agent-lock.interface';
import type { ISessionBalance } from './agent-lock-session-store';
import {
	appendSessionEntry,
	readSessionBalance,
	resetSessionBalance,
} from './agent-lock-session-store';
import { getNow } from './lock-paths';
import { basename, dirname } from 'node:path';

// f00154 S2 audit: the previous module-level single `lastKnownSessionBalance`
// bled across workspaces when the same MCP server reused its process to
// drive two workspaces sequentially (CI / orchestrator scenarios). After
// workspace A's `agent_lock release`, the cached balance held A's numbers
// and a subsequent read on workspace B reported A's session counters.
// Key the cache by absolute workspace root so each workspace has its
// own balance snapshot.
export const EMPTY_BALANCE: ISessionBalance = {
	claims: 0,
	releases: 0,
	imbalance: 0,
};

export const balanceByWorkspace = new Map<string, ISessionBalance>();

export const knownBalanceFor = (
	workspaceRoot: string | undefined,
): ISessionBalance => {
	if (workspaceRoot === undefined) return EMPTY_BALANCE;
	return balanceByWorkspace.get(workspaceRoot) ?? EMPTY_BALANCE;
};

export const getAgentLockSessionBalance = async (
	workspaceRootAbs?: string,
): Promise<{
	readonly claims: number;
	readonly releases: number;
	readonly imbalance: number;
}> => {
	// Prefer the explicit workspace root; fall back to the last-seen
	// one (set by `runAgentLockEngine`); throw if neither is known.
	const workspaceRoot = workspaceRootAbs ?? lastSessionWorkspaceRoot;
	if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
		throw new Error(
			'agent-lock: getAgentLockSessionBalance requires a workspaceRootAbs (or a prior runAgentLockEngine call to seed it). ' +
				'Refusing to read from process.cwd() — see AGENTS.md.',
		);
	}
	const fresh = await readSessionBalance(workspaceRoot);
	balanceByWorkspace.set(workspaceRoot, fresh);
	return fresh;
};

export const resetAgentLockSessionBalance = async (): Promise<void> => {
	balanceByWorkspace.clear();
	await resetSessionBalance();
};

/**
 * x00163 fix: this used to check only ONE level up (`basename(parent)
 * === '.cache'`), which is correct for a lock path shaped
 * `<root>/.cache/agents.lock.json` but wrong for the real, canonical
 * shape `<root>/.cache/delendai/agents.lock.json` (the plugin cache
 * dir adds an extra `delendai` segment). On the real shape the old
 * code returned `<root>/.cache/delendai` itself as the "workspace
 * root", which `sessionLogPath` then re-joined with `.cache/delendai`
 * again — producing a doubly-nested
 * `<root>/.cache/delendai/.cache/delendai/agents.lock.session.jsonl`
 * on every real session (confirmed live: this exact stray path exists
 * on disk in this repo's own `.cache/`). Walk up from the lock path
 * looking for a directory literally named `.cache` and return ITS
 * parent — this is correct for both the one-level test-fixture shape
 * and the real two-level plugin-cache-dir shape.
 */

/**
 * x00163 fix: this used to check only ONE level up (`basename(parent)
 * === '.cache'`), which is correct for a lock path shaped
 * `<root>/.cache/agents.lock.json` but wrong for the real, canonical
 * shape `<root>/.cache/delendai/agents.lock.json` (the plugin cache
 * dir adds an extra `delendai` segment). On the real shape the old
 * code returned `<root>/.cache/delendai` itself as the "workspace
 * root", which `sessionLogPath` then re-joined with `.cache/delendai`
 * again — producing a doubly-nested
 * `<root>/.cache/delendai/.cache/delendai/agents.lock.session.jsonl`
 * on every real session (confirmed live: this exact stray path exists
 * on disk in this repo's own `.cache/`). Walk up from the lock path
 * looking for a directory literally named `.cache` and return ITS
 * parent — this is correct for both the one-level test-fixture shape
 * and the real two-level plugin-cache-dir shape.
 */
export const resolveSessionWorkspaceRoot = (
	deps: IAgentLockDeps,
): string | undefined => {
	if (!deps.lockPath) return undefined;
	let dir = dirname(deps.lockPath);
	for (;;) {
		if (basename(dir) === '.cache') return dirname(dir);
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return dirname(deps.lockPath);
};

export const replaceSessionBalance = (
	response: IAgentLockResponse,
	balance: ISessionBalance,
): IAgentLockResponse => {
	const raw = response.content[0]?.text;
	if (typeof raw !== 'string') return response;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			...response,
			content: [
				{
					type: 'text',
					text: JSON.stringify({
						...parsed,
						session: {
							claims: balance.claims,
							releases: balance.releases,
							imbalance: balance.imbalance,
						},
					}),
				},
			],
		};
	} catch {
		return response;
	}
};

export const applyPersistedSessionBalance = async (
	response: IAgentLockResponse,
	args: IAgentLockArgs,
	deps: IAgentLockDeps,
): Promise<IAgentLockResponse> => {
	// f00154 S2 audit: this function must NEVER throw — the underlying
	// lock op has already succeeded by the time we get here, and a
	// failure in the session-log write (disk full, EACCES on the
	// .cache dir, …) used to bubble up and made the caller see the
	// claim/release as failed when it actually succeeded. The lock
	// outcome is encoded in `response`; treat telemetry as best-effort.
	const workspaceRoot = resolveSessionWorkspaceRoot(deps);
	if (typeof workspaceRoot !== 'string' || workspaceRoot.length === 0) {
		// f00154 S2 audit: refuse to fall back to cwd() — without an
		// explicit workspace root we cannot write the session log to the
		// correct location. Skip telemetry and return the response
		// untouched (the lock op already succeeded).
		return response;
	}
	const raw = response.content[0]?.text;
	if (typeof raw !== 'string') return response;
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return response;
	}
	try {
		if (
			args.action === 'claim' &&
			payload.claimed === true &&
			payload.ok === true
		) {
			await appendSessionEntry(
				{
					ts: getNow(deps),
					agent: String(payload.agent ?? args.agent ?? ''),
					action: 'claim',
					ok: true,
				},
				workspaceRoot,
			);
		}
		if (
			args.action === 'release' &&
			payload.released === true &&
			payload.ok === true
		) {
			await appendSessionEntry(
				{
					ts: getNow(deps),
					agent: String(payload.agent ?? 'unknown'),
					action: 'release',
					ok: true,
				},
				workspaceRoot,
			);
		}
		const fresh = await readSessionBalance(workspaceRoot);
		balanceByWorkspace.set(workspaceRoot, fresh);
	} catch (telemetryError) {
		// Telemetry failure: log on stderr and continue. The lock op's
		// outcome lives in `response` and must not be invalidated by
		// a session-log write.
		process.stderr.write(
			`agent_lock: session log update failed (${(telemetryError as Error).message}); lock op result preserved.\n`,
		);
		return response;
	}
	return replaceSessionBalance(response, knownBalanceFor(workspaceRoot));
};
