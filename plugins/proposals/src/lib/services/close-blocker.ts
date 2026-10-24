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

const CLAIM_PATTERN =
	/claim for (\S+): (none|stale|active)(?: \(held by ([^)]*)\))?/iu;
const ACTOR_RESOLVED_PATTERN = /resolved actor: (\S+)/iu;

/**
 * The step for a caller who is not provably active, from the facts the
 * gate recorded about the claim for this task. A claim is the fix only
 * when none exists: naming it otherwise sends the caller to repeat a call
 * that already succeeded.
 */
const actorNextAction = (reasons: readonly string[]): string => {
	const haystack = reasons.join(' | ');
	const claim = CLAIM_PATTERN.exec(haystack);
	const actor = ACTOR_RESOLVED_PATTERN.exec(haystack)?.[1];
	const as = actor === undefined || actor === 'none' ? '' : ` as ${actor}`;
	if (claim === null) {
		return 'You are not a provably active actor in the activity snapshot. Re-claim with `agent_lock action:"claim"` listing this slice\'s files, or close from your own unit (`delendai work enter`, pass its worktree as `checkout`), then retry close_slice. This is NOT the validate gate.';
	}
	const [, task, state, holder] = claim;
	if (state === 'none') {
		return `No claim for ${task} exists in the lock file named in blockingReasons, and you were resolved${as}. Claim it with \`agent_lock action:"claim" task_id:"${task}"\` listing this slice's files, or close from your own unit (\`delendai work enter\`, pass its worktree as \`checkout\`), then retry close_slice. This is NOT the validate gate.`;
	}
	if (state === 'stale') {
		return `A claim for ${task} exists (held by ${holder}) but its heartbeat is stale, so it proves nothing; you were resolved${as}. Refresh it with \`agent_lock action:"heartbeat"\` (or claim again), then retry close_slice. Re-claiming from scratch is not needed if the holder is you. This is NOT the validate gate.`;
	}
	return `A live claim for ${task} exists, held by ${holder}, but you were resolved${as}, so it is not yours. Pass \`agent: "${holder}"\` if you are that actor, or close from your own unit. Claiming again will not change who you are resolved as. This is NOT the validate gate.`;
};

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
			nextAction: actorNextAction(input.blockingReasons),
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
