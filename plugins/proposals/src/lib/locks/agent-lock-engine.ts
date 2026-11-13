export {
	AGENT_LOCK_TMP_STALE_MS,
	claimWithFileLocks,
	cleanupStaleAgentLockState,
	getAgentLockSessionBalance,
	listStaleAgentLockTmpFiles,
	readLock,
	releaseAgentSessionClaims,
	removeStale,
	resetAgentLockSessionBalance,
	runAgentLockEngine,
	sweepStaleAgentLockTmpFiles,
} from './engine';

export type {
	IAgentLockAction,
	IAgentLockArgs,
	IAgentLockDeps,
	IAgentLockResponse,
	IAgentLockTmpFileInfo,
	ILockEntry,
	ILockFile,
	IReleaseAuditEntry,
} from './engine';
