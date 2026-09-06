/**
 * agent-lock.interface.ts — r00042 S3.
 *
 * The agent-lock vocabulary, moved out of `engine.ts` unchanged.
 *
 * The engine was 1,394 lines against a 600-line ceiling this proposal
 * sets, and it is concurrency-sensitive code with a recorded history of
 * subtle correctness bugs. So the split moves whole declarations verbatim
 * and never edits a body — and it starts with the types, where there is no
 * body to get wrong. `engine.ts` re-exports all of them, so nothing that
 * imports them changes.
 */
import type { ISessionBalance } from '../../locks/agent-lock-session-store';

export type IAgentLockAction =
	| 'claim'
	| 'heartbeat'
	| 'release'
	| 'status'
	| 'gc';

export type IAgentLockArgs = {
	action: IAgentLockAction;
	task_id?: string | undefined;
	agent?: string | undefined;
	files?: string[] | undefined;
	parent_task_id?: string | undefined;
	/**
	 * What `withFileMutex` should do when a **live** holder keeps the lock
	 * file past its contention timeout: `'steal'` (default) reclaims
	 * it as before; `'fail'` rejects instead of clobbering a slow-but-alive
	 * holder. Forwarded as-is — see `IFileMutexOptions.onContention`.
	 */
	onContention?: 'steal' | 'fail' | undefined;
};

export type ILockEntry = {
	task_id: string;
	agent: string;
	ownership: string[];
	started_at: string;
	last_seen: string;
	parent_task_id?: string;
	// Cross-process release tracking. Both
	// fields are optional so locks persisted before the tracking was
	// added (e.g. a host process that has not yet been restarted)
	// still parse; the release handler treats missing fields as
	// "backfill on next touch" rather than as a hard mismatch.
	host?: string;
	pid?: number;
};

export type ILockFile = {
	$schema?: string;
	description?: string;
	version: number;
	stale_after_minutes: number;
	in_flight: ILockEntry[];
};

export interface IAgentLockTmpFileInfo {
	readonly absPath: string;
	readonly relName: string;
	readonly mtime: string;
	readonly ageSeconds: number;
}

export type IAgentLockDeps = {
	lockPath?: string;
	now?: () => string;
	toolName?: string;
	lockFileLabel?: string;
	mutexTimeoutMs?: number;
	mutexStaleMs?: number;
	mutexPollMs?: number;
	fileLockTablePath?: string;
	agentWorktreeEnabled?: boolean;
	currentBranchOverride?: string;
	/**
	 * x00155 S2 / x00153 S5 — caller-host identity used to detect a
	 * cross-process release after a host restart. Defaults to
	 * `{ host: os.hostname(), pid: process.pid }`. Tests inject a
	 * deterministic value to simulate the "new PID's
	 * `vscode-copilot-m3` agent" scenario.
	 */
	nowHostId?: () => { host: string; pid: number };
};

export type IAgentLockResponse = {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
};

// One JSONL line per cross-process release.
// Lives under `.cache/delendai/agents.lock.releases.jsonl`; operators
// grep this to find host-restart patterns in production.
export type IReleaseAuditEntry = {
	readonly task_id: string;
	readonly agent: string;
	readonly originalHost: string | undefined;
	readonly originalPid: number | undefined;
	readonly releasingHost: string;
	readonly releasingPid: number;
	readonly ts: string;
	readonly reason: 'cross-process release';
};
