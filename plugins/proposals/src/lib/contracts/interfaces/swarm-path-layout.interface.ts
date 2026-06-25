/**
 * Workspace-relative locations of every artefact the swarm runtime
 * persists. Derived from the host's `cacheDir`/`docsDir` (see
 * `buildSwarmPaths`), or taken from `DEFAULT_PATH_LAYOUT`. All values
 * are relative to the workspace root resolved by the core
 * `IWorkspacePathProvider`.
 */
export interface IHostPathLayout {
	/** File-level mutex with heartbeat (agent lock subsystem). */
	readonly lockFile: string;
	/** Registry of spawned subagents. */
	readonly agentRegistryFile: string;
	/** Round-context digest cache (staleness detection). */
	readonly roundContextDigestFile: string;
	/** Directory holding the persistent task queue artefacts. */
	readonly taskQueueDir: string;
	/** Persistent task queue. */
	readonly taskQueueFile: string;
	/** Task queue heartbeat. */
	readonly taskQueueHeartbeatFile: string;
	/** Log of closed tasks. */
	readonly closedTasksFile: string;
	/** Orchestrator checkpoint. */
	readonly orchestratorCheckpointFile: string;
	/** Orchestrator chat context. */
	readonly orchestratorChatContextFile: string;
	/** Last end-of-day report. */
	readonly finishDayReportFile: string;
	/** Append-only end-of-day journal. */
	readonly finishDayJournalFile: string;
	/** Directory holding the proposal documents. */
	readonly proposalsDir: string;
	/** Machine-readable proposal index. */
	readonly proposalIndexFile: string;
	/** f00016 S13: per-kind sequential id counters (race-safe allocation). */
	readonly proposalIdCountersFile: string;
	/** Directory holding disposable per-agent git worktrees. */
	readonly worktreesDir: string;
	/** Scratch directory for transient agent artefacts. */
	readonly scratchDir: string;
}
