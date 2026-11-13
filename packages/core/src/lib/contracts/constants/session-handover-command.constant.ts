/** The command a host runs to persist the handover and re-read its index. */
export const SESSION_HANDOVER_COMMAND = 'delendai session handover';

/** The handover kept when no session is named: one per workspace. */
export const SESSION_HANDOVER_DEFAULT_SESSION = 'workspace';

/** What the index may weigh when a host re-injects it after compaction. */
export const SESSION_HANDOVER_INDEX_MAX_BYTES = 6144;

/** The actions of the handover command. */
export const SESSION_HANDOVER_ACTIONS = ['persist', 'index', 'show'] as const;
