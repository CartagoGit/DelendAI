/** The old standalone audit store must never coexist with the proposal store. */
export declare const assertNoLegacyAuditDirectory: (
	root: string,
) => Promise<void>;
