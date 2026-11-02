import z from 'zod';

/**
 * Default tool names the loop detector skips. The orchestrator's host can
 * extend or replace this via `loopDetectorDisableFor` on the tool options.
 * `<prefix>_auto_work` is excluded by default — see the doc comment on
 * `IAutoWorkToolOptions.loopDetectorDisableFor` for the rationale.
 */
export const DEFAULT_LOOP_DETECTOR_DISABLE_FOR = [
	'proposals_auto_work',
] as const;

// Hard anti-idle brake: the `idle` state is guidance, but a model can ignore it
// and re-call auto_work in a tight loop. After this many CONSECUTIVE idle
// responses we escalate to `stop: true` so a wrapper/agent halts deterministically.
// Any actionable ('work') response resets the streak.
export const IDLE_STOP_THRESHOLD = 3;

export const DEFAULT_DELEGATE_AFTER_TOOL_CALLS = 3;

export const AUTO_WORK_INPUT_SCHEMA = z
	.object({
		/**
		 * Optional per-call override for the persist mode. Resolved with
		 * priority `args.persist` > `config.persist.mode` > `'none'`.
		 * See l109 §2 "Resolution priority".
		 */
		persist: z.enum(['none', 'commit', 'commit-and-push']).optional(),
		/**
		 * When true, fall back to a paused-proposals cascade if the
		 * standard cascade has no actionable candidates. Default false.
		 * Resolved with priority `args.includePaused` >
		 * `config.autoWork.defaultIncludePaused` > false. Paused
		 * proposals are NEVER interleaved with the primary cascade —
		 * they only enter when nothing else is actionable.
		 */
		includePaused: z.boolean().optional(),
		/**
		 * f00075 S4: when true, the auto_work front-hook skips the
		 * four-state hygiene check (rescue / stash / gc / out-of-cache)
		 * and proceeds straight to slice selection. Default false —
		 * the orchestrator is strict by default because rescue
		 * candidates and stashes represent work at risk of loss, which
		 * is exactly the failure mode the user complained about.
		 * Use this when the user has already handled the blockers
		 * manually (e.g. they just popped the stash, or they already
		 * cherry-picked the rescue branch) and want the plan to
		 * continue.
		 */
		forceHygieneBypass: z.boolean().optional(),
	})
	.strict();

export const AUTO_WORK_OUTPUT_SCHEMA = z.object({
	state: z.enum(['idle', 'work']),
	idleStreak: z.number().int().positive().optional(),
	reason: z.string().optional(),
	stop: z.literal(true).optional(),
	handoffPath: z.string().optional(),
	nextAction: z.string().optional(),
	proposalId: z.string().optional(),
	file: z.string().optional(),
	pickedFromPaused: z.literal(true).optional(),
	orchestration: z.unknown().optional(),
	validationCommand: z.string().optional(),
	persist: z.unknown().optional(),
	claimReady: z.unknown().optional(),
	action: z.enum(['close']).optional(),
	steps: z.array(z.string()).optional(),
	// Optional array of warnings about other agents' branch /
	// worktree state. Empty when the swarm is clean.
	branchStatusWarnings: z.array(z.string()).optional(),
	// S4: front-hook hygiene fields. `executionMode` is
	// `'normal'` when nothing is wrong, `'confirm-required'` when the
	// GC plan has entries, `'blocked'` when rescue candidates or
	// stashes are pending. `ok: false` plus `reason: 'hygiene-blocked'`
	// is the strict-mode reply when the orchestrator cannot proceed
	// without human action.
	executionMode: z.enum(['normal', 'confirm-required', 'blocked']).optional(),
	hygieneBlockers: z.array(z.string()).optional(),
	hygieneActions: z.array(z.string()).optional(),
	hygieneWarnings: z.array(z.string()).optional(),
	stashes: z.unknown().optional(),
	rescueCandidates: z.unknown().optional(),
	// R-2026-08-31: rescue-candidate lookalikes that the engine
	// classifies as smoke artifacts. Surfaced on the response so the
	// operator can prune them with `git branch -D` /
	// `proposals_branch_gc` without gating the cascade.
	smokeResiduals: z.unknown().optional(),
	// Strict-mode envelope: when the front-hook blocks, the plan also
	// sets `ok: false` and `reason: 'hygiene-blocked'`. The fields
	// below are the structured payload so the orchestrator can render
	// the exact branches/stashes that need human action.
	ok: z.boolean().optional(),
	blockers: z.array(z.string()).optional(),
});
