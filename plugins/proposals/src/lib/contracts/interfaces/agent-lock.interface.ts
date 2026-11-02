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
	/**
	 * Who the claim belongs to. `'process'` (default) ties it to the
	 * server process that took it: a long-lived host releases it when its
	 * transport closes, and a dead owner is reclaimable at once.
	 * `'agent'` ties it to the agent alone, so it outlives the process:
	 * a caller whose every call is a new, short-lived process (the CLI)
	 * would otherwise lose the claim the moment its first call returned.
	 * It then expires by heartbeat like any claim from another machine.
	 */
	holder?: 'process' | 'agent' | undefined;
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
