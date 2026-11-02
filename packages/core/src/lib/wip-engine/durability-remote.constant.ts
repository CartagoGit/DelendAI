/** Refusal when a checkpoint must be pushed but no remote can be resolved. */
export const DURABILITY_REMOTE_MISSING =
	'policy requires autoPushAfterCommit but no remote is available: set commit-policy push.remote or add an `origin` remote';
