import type { ICloseBlockerGuidance } from '../contracts/interfaces/close-blocker.interface';

/**
 * Turn a blocked close into a next step.
 *
 * Every branch of the resolver that blocks knows something specific and
 * repairable. The two that actually stop agents in this repo are:
 *
 * - the activity snapshot disagrees with itself (a torn lock file, a
 *   registry that contradicts the locks), which `state_health` reports
 *   and `state_repair` fixes; and
 * - the caller is not a provably active actor, which happens when an
 *   agent releases its lock before closing, or closes work it never
 *   claimed. Re-claiming is the whole fix, and nothing said so.
 *
 * Neither is the validate gate, which is what an agent reaching for the
 * most familiar explanation will assume — and then it waits for a green
 * validate that would not have unblocked it anyway.
 */

const SNAPSHOT_PATTERN = /corrupt|contradict|disagree/iu;
const ACTOR_PATTERN = /actor/iu;
const SCOPE_PATTERN = /scope/iu;

export const buildCloseBlockerGuidance = (input: {
	readonly reason: string;
	readonly blockingReasons: readonly string[];
}): ICloseBlockerGuidance => {
	const haystack = [input.reason, ...input.blockingReasons].join(' | ');
	if (SNAPSHOT_PATTERN.test(haystack)) {
		return {
			blockingReasons: [...input.blockingReasons],
			nextAction:
				'The swarm activity snapshot disagrees with itself, so no close can be trusted. Run `state_health` to see which source is inconsistent, then `state_repair` to reconcile it (`agents_lock_diagnose` if the disagreement is in the lock file). This is NOT the validate gate — a green validate will not clear it. Retry close_slice once the snapshot is consistent.',
		};
	}
	if (ACTOR_PATTERN.test(haystack)) {
		return {
			blockingReasons: [...input.blockingReasons],
			nextAction:
				'You are not a provably active actor in the activity snapshot — usually because the lock was released before closing, or the slice was never claimed. Re-claim with `agent_lock action:"claim"` listing this slice\'s files, then retry close_slice. This is NOT the validate gate.',
		};
	}
	if (SCOPE_PATTERN.test(haystack)) {
		return {
			blockingReasons: [...input.blockingReasons],
			nextAction:
				"Some of this slice's files fall outside every configured quality scope, so the close cannot be validated. Either add the files to a scope in the quality plugin options, or correct the slice's `Files:` list if it names paths the slice does not actually touch. This is NOT the validate gate.",
		};
	}
	return {
		blockingReasons: [...input.blockingReasons],
		// Unknown branch: say so honestly and hand over the raw reasons
		// rather than inventing an action that may not apply. An agent
		// can escalate a stated unknown; it cannot escalate silence.
		nextAction:
			'The close was blocked by the swarm validation gate for a reason this tool does not have specific guidance for — the exact causes are in `blockingReasons`. Run `state_health` for the current snapshot. Do NOT retry this call unchanged, and do NOT assume it is the validate gate; report the blocking reasons if none of them is something you can act on.',
	};
};
