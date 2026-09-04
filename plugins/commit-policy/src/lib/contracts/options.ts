/**
 * options.ts — ICommitPolicyOptions + its zod schema.
 *
 * The plugin's option tree is the contract between the host config
 * (`mcp-vertex.config.json#plugins.commit-policy.options`) and the
 * engine. Every branch is a discriminated union so the resolver
 * knows exactly which other branches are live at runtime — no
 * `if (options.identity.mode === ...)` chains sprinkled across the
 * code, and no surprise defaults when the host omits a field.
 *
 * Defaults (all opt-in — see the README):
 *   commit.enabled           = false
 *   push.enabled             = false
 *   push.onCommit            = false
 *   identity.mode            = 'global'   (resolve from `git config --global`)
 *   audit.trailer            = 'co-authored-by'
 *   audit.agentFormat        = '${host}/${model}'
 *   triggers                 = []         (no automatic commits)
 *   protectedBranches        = []
 *   force                    = 'with-lease'
 */

import z from 'zod';

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Stable, copy-pasteable mode identifiers (use these in config + tests). */
export const COMMIT_POLICY_IDENTITY_MODES = [
	'explicit',
	'agent',
	'repo',
	'global',
	'env',
	'auto',
] as const;

export type CommitPolicyIdentityMode =
	(typeof COMMIT_POLICY_IDENTITY_MODES)[number];

/**
 * When `mode === 'explicit'`, the host MUST supply `owner`. Empty
 * strings fail validation up-front so the runtime never has to
 * guess between "user forgot to set me" and "user wants me empty".
 */
const ExplicitIdentitySchema = z.object({
	mode: z.literal('explicit'),
	owner: z.object({
		name: z.string().min(1, 'explicit identity requires a non-empty name'),
		email: z
			.string()
			.min(1, 'explicit identity requires a non-empty email'),
	}),
});

/**
 * `agent` — use the resolved host identity (host + model name) when
 * one is available; fall back to the global git config.
 */
const AgentIdentitySchema = z.object({
	mode: z.literal('agent'),
	/** Override the displayed name when the host identity is missing. */
	fallbackName: z.string().optional(),
	/** Override the email when the host identity is missing. */
	fallbackEmail: z.string().optional(),
});

/** `repo` — use whatever `git config user.name|user.email` says in this repo. */
const RepoIdentitySchema = z.object({ mode: z.literal('repo') });

/** `global` — use `git config --global user.name|user.email`. */
const GlobalIdentitySchema = z.object({ mode: z.literal('global') });

/**
 * `env` — use `GIT_AUTHOR_NAME` + `GIT_AUTHOR_EMAIL` from the process
 * environment. Missing variables fail the commit with a typed reason.
 */
const EnvIdentitySchema = z.object({ mode: z.literal('env') });

/**
 * `auto` — apply the deterministic priority
 *   env > global > repo > agent
 * This is the default for hosts that do not pick a mode.
 */
const AutoIdentitySchema = z.object({ mode: z.literal('auto') });

export const IdentitySchema = z.discriminatedUnion('mode', [
	ExplicitIdentitySchema,
	AgentIdentitySchema,
	RepoIdentitySchema,
	GlobalIdentitySchema,
	EnvIdentitySchema,
	AutoIdentitySchema,
]);

export type ICommitPolicyIdentity =
	| z.infer<typeof ExplicitIdentitySchema>
	| z.infer<typeof AgentIdentitySchema>
	| z.infer<typeof RepoIdentitySchema>
	| z.infer<typeof GlobalIdentitySchema>
	| z.infer<typeof EnvIdentitySchema>
	| z.infer<typeof AutoIdentitySchema>;

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/** Stable, copy-pasteable trailer kinds. */
export const AUDIT_TRAILERS = [
	'none',
	'co-authored-by',
	'body-metadata',
] as const;
export type AuditTrailerKind = (typeof AUDIT_TRAILERS)[number];

export const AuditSchema = z.object({
	/**
	 * Default `none` — keeps LLM attribution off GitHub commits. Pre-f00500
	 * the default was `co-authored-by`; that was flipped because even when
	 * the project's `identity.mode === 'explicit'` (so the commit author is
	 * always the human maintainer), the `Co-Authored-By:` trailer still
	 * leaked the host+model of the agent that drafted the change
	 * (`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`), and GitHub
	 * surfaces that on the commit page and — when the email resolves — adds
	 * the brand to the contributor graph. Hosts that need the audit
	 * trailer (e.g. for human-human `Co-authored-by` lines) can still set
	 * the value explicitly; the field is fully configurable.
	 */
	trailer: z.enum(AUDIT_TRAILERS).default('none'),
	/**
	 * Template for the agent portion of the trailer. Supports the
	 * placeholders `${host}`, `${model}`, `${date}`. Default
	 * `${host}/${model}` — matches the dogfooding format used in
	 * this repo's existing `Co-authored-by:` lines.
	 */
	agentFormat: z.string().default('${host}/${model}'),
});

export type ICommitPolicyAudit = z.infer<typeof AuditSchema>;

// ---------------------------------------------------------------------------
// Cadence / triggers
// ---------------------------------------------------------------------------

export const TRIGGER_KINDS = [
	'slice',
	'threshold',
	'interval',
	'manual',
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** Slice trigger — fires when a `proposals` slice closes. */
const SliceTriggerSchema = z.object({
	kind: z.literal('slice'),
	/**
	 * Slice statuses that count as a "task done" event. Default
	 * `['done']`. Hosts that also want to commit on `merged` add
	 * it explicitly.
	 */
	onStatuses: z.array(z.enum(['done', 'merged'])).default(['done']),
});

/** Threshold trigger — fires when N files modified in the session. */
const ThresholdTriggerSchema = z.object({
	kind: z.literal('threshold'),
	/** Number of modified files that triggers a commit. Default 10. */
	files: z.number().int().positive().default(10),
});

/** Interval trigger — fires every N minutes if there are uncommitted changes. */
const IntervalTriggerSchema = z.object({
	kind: z.literal('interval'),
	/** Minutes between checks. Default 30. */
	minutes: z.number().int().positive().default(30),
});

/** Manual trigger — only fires via the `_run` tool. Always last-resort. */
const ManualTriggerSchema = z.object({ kind: z.literal('manual') });

export const TriggerSchema = z.discriminatedUnion('kind', [
	SliceTriggerSchema,
	ThresholdTriggerSchema,
	IntervalTriggerSchema,
	ManualTriggerSchema,
]);

export type ICommitPolicyTrigger = z.infer<typeof TriggerSchema>;

export const CadenceSchema = z.object({
	/**
	 * Triggers enabled for this project. Empty array = no automatic
	 * commits (the host may still call `_run` to fire `manual`).
	 * Hosts that want per-slice commits include `'slice'` here.
	 */
	triggers: z.array(TriggerSchema).default([]),
	/**
	 * When the slice trigger fires, restrict commits to the slice's
	 * own `files:` list instead of `git status --porcelain` (which
	 * may include unrelated dirt). Default true.
	 */
	sliceScoping: z.boolean().default(true),
	/**
	 * Explicitly allow slice commits to include changes made by other
	 * agents in the shared checkout. When enabled, the current dirty
	 * workspace snapshot is committed. Default false.
	 */
	allowForeignChanges: z.boolean().default(false),
	/**
	 * Withhold a file from a workspace-derived commit while it is still
	 * being edited: anything modified more recently than this many
	 * milliseconds is left for the next sweep.
	 *
	 * `filterForeignLockedFiles` already protects work an agent has
	 * CLAIMED through the lock file. This covers the rest — an agent
	 * working directly, a second host, the maintainer in an editor — none
	 * of which hold a lock, and all of which an interval sweep will
	 * otherwise commit mid-edit under an auto-generated message.
	 *
	 * `0` disables it. The effective default is short on purpose: the
	 * sweep exists so work is not LOST in a shared worktree, and deferring
	 * a file by a minute does not endanger that, while claiming it
	 * mid-edit does.
	 *
	 * Optional rather than defaulted here so the default lives in exactly
	 * one place — `DEFAULT_QUIET_PERIOD_MS` in `recent-edit-filter.ts`,
	 * next to the code that applies it. A `.default()` on the schema would
	 * be a second copy of the number, and the two would eventually
	 * disagree.
	 */
	quietPeriodMs: z.number().int().nonnegative().optional(),
});

export type ICommitPolicyCadence = z.infer<typeof CadenceSchema>;

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** Force policy for `git push`. */
export const FORCE_MODES = ['with-lease', 'allow', 'never'] as const;
export type ForceMode = (typeof FORCE_MODES)[number];

const PushObjectSchema = z.object({
	/** Master switch for push — default false (no push ever). */
	enabled: z.boolean().default(false),
	/** Push immediately after every successful commit. Default false. */
	onCommit: z.boolean().default(false),
	/** Push every N successful commits. Mutually compatible with onCommit. */
	everyNCommits: z.number().int().positive().optional(),
	/** Push every N minutes if there are unpushed commits. */
	everyNMinutes: z.number().int().positive().optional(),
	/** Force policy. Default `with-lease` (the safe one). */
	force: z.enum(FORCE_MODES).default('with-lease'),
	/**
	 * Required justification for `force: 'allow'` (plain `--force`,
	 * bypassing `--force-with-lease`'s safety check). Threaded straight
	 * through to the shared `gitPush` primitive's
	 * `authorization.reason` (see `push-driver.ts`). Enforced below by
	 * `superRefine` so enabling `allow` requires literally writing down
	 * WHY — a bare boolean flip is not enough to authorize an
	 * irreversible history rewrite.
	 */
	forceReason: z
		.string()
		.trim()
		.min(1, 'push.forceReason must not be empty when set')
		.optional(),
	/** Protected branches — push is always refused. Default `[]`. */
	protectedBranches: z.array(z.string()).default([]),
	/**
	 * x00267 (AUD-CP-009): branch-name prefixes that are also
	 * protected (e.g. `release/`, `hotfix/`). The unified branch
	 * policy applies the same list to every commit path AND to
	 * the push scheduler. Defaults to `[]`.
	 * Optional in the type so existing test fixtures (built as
	 * raw objects) keep compiling; `parseCommitPolicyOptions`
	 * fills the default at parse time.
	 */
	protectedPrefixes: z.array(z.string()).default([]).optional(),
	/** Remote name. Defaults to whatever `git config push.default` resolves. */
	remote: z.string().optional(),
	/** Branch name. Defaults to the current branch. */
	branch: z.string().optional(),
	/** Optional provider overrides keyed by remote host for self-hosted forges. */
	providerByHost: z
		.record(z.string(), z.enum(['github', 'gitlab', 'unknown']))
		.optional(),
});

export const PushSchema = PushObjectSchema.superRefine((value, ctx) => {
	// A config that flips `force` to `allow` without stating why is
	// exactly the "a config string is all it takes to rewrite shared
	// history" hole `push-driver.ts` closes — refuse it at parse time
	// rather than letting it surface only as a runtime push refusal.
	if (
		value.force === 'allow' &&
		(value.forceReason === undefined || value.forceReason.length === 0)
	) {
		ctx.addIssue({
			code: 'custom',
			path: ['forceReason'],
			message:
				'push.forceReason is required when push.force is "allow" — state why plain --force is warranted',
		});
	}
});

export type ICommitPolicyPush = z.infer<typeof PushObjectSchema>;

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

export const CommitSchema = z.object({
	/** Master switch for commit — default false. */
	enabled: z.boolean().default(false),
	/**
	 * Refuse to commit if the message does not start with a
	 * Conventional Commit prefix. Default true. Hosts that want
	 * free-form messages set this to false.
	 */
	requireConventional: z.boolean().default(true),
	/**
	 * Include a Conventional-Commit scope derived from the proposal
	 * id when the slice trigger fires (e.g. `feat(f00181): ...`).
	 * Default true.
	 */
	autoScopeFromProposal: z.boolean().default(true),
	/**
	 * When `enabled` is false, surface a clear refusal (instead of
	 * silently dropping the call). Default true.
	 */
	refuseWhenDisabled: z.boolean().default(true),
});

export type ICommitPolicyCommit = z.infer<typeof CommitSchema>;

// ---------------------------------------------------------------------------
// Stash
// ---------------------------------------------------------------------------

export const StashSchema = z.object({
	/** Whether agents may create, apply, list, or drop git stashes. */
	enabled: z.boolean().default(false),
});

export type ICommitPolicyStash = z.infer<typeof StashSchema>;

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

/**
 * zod schema for `plugins.commit-policy.options`. Parsed once at
 * register time; the resolver never sees the raw options object.
 */
export const CommitPolicyOptionsSchema = z.object({
	/** Maximum time allowed for commit-policy git commands. */
	gitTimeoutMs: z.number().int().positive().default(60_000),
	commit: CommitSchema.default({
		enabled: false,
		requireConventional: true,
		autoScopeFromProposal: true,
		refuseWhenDisabled: true,
	}),
	stash: StashSchema.default({ enabled: false }),
	identity: IdentitySchema.default({ mode: 'global' }),
	audit: AuditSchema.default({
		trailer: 'co-authored-by',
		agentFormat: '${host}/${model}',
	}),
	cadence: CadenceSchema.default({
		triggers: [],
		sliceScoping: true,
		allowForeignChanges: false,
	}),
	push: PushSchema.default({
		enabled: false,
		onCommit: false,
		force: 'with-lease',
		protectedBranches: [],
		protectedPrefixes: [],
	}),
});
export type ICommitPolicyOptions = z.infer<typeof CommitPolicyOptionsSchema>;

/** Resolve raw host options through the schema with conservative defaults. */
export const parseCommitPolicyOptions = (
	raw: Readonly<Record<string, unknown>>,
): ICommitPolicyOptions => CommitPolicyOptionsSchema.parse(raw);
