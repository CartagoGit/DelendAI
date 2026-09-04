/**
 * agent-lock-engine.constant.ts — the agent lock engine's data constants.
 *
 * `r00042` S3 split `locks/engine.ts` into cohesive modules. That split
 * forced several declarations that had been module-local to become
 * exported so siblings could reach them — and exported SCREAMING_SNAKE
 * values belong in `contracts/constants/` by this repo's convention
 * (`lint:types-in-contracts`), not beside the logic that reads them.
 *
 * Only genuine data lives here. The `EMPTY_*` factories the same split
 * exposed were renamed to `emptyTable`/`emptyDocument`/`emptyLock`
 * instead of being moved: they are functions returning a fresh mutable
 * object, and filing a factory under "constants" because of its casing
 * would have made the convention lie about what the code is.
 */
import type { ISessionBalance } from '../../locks/agent-lock-session-store';

export const CONTENTION_NEXT =
	'Do not busy-poll agent_lock status. Call notification_await_lock (or wait for a lock-released notification via notify_status), then retry the claim once ownership is free.';

export const LIVELOCK_NEXT =
	'Run proposals_state_health to inspect livelockPairs, then clear the stale file-lock state before retrying this claim.';

export const CONTENTION_HISTORY_WINDOW_MS = 60_000;

export const AGENT_LOCK_TMP_STALE_MS = 60_000;

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
