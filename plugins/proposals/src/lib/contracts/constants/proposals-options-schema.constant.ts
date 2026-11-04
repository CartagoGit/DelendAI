import z from 'zod';

/**
 * The proposals workflow plugin. It turns delendai into a multi-agent
 * proposal runner: a file-based proposal store, file-level write locks
 * and a persistent task queue (the "swarm" coordination layer).
 *
 * Load it with `delendai --plugins=proposals`. Paths come from the
 * core's resolved roots: cache/state under `<cacheDir>/proposals`,
 * human-edited proposals under `<docsDir>/proposals`. Override the docs
 * root with `--docsDir`, the cache root with `--cacheDir`.
 *
 * Every tool is namespaced by the plugin (`proposals_*` by default)
 * and returns structured JSON so any agent or model consumes it the
 * same way.
 */
/**
 * r00003 S9 (F9, O + L + I): the proposals plugin's options schema, named
 * so `register()` can `safeParse(ctx.options)` against the SAME contract
 * the loader validates — the configured and validated plugin are one
 * (LSP), and `proposalFolders` / `proposalNarrativePatterns` are typed
 * fields, not `ctx.options.X as Y` casts.
 */
export const PROPOSALS_OPTIONS_SCHEMA = z.object({
	/** Workspace-relative proposal content root. Defaults to <docsDir>/proposals. */
	proposalsDir: z.string().min(1).optional(),
	/** Custom symbolic agent-name pool. */
	namePool: z.array(z.string()).optional(),
	/** Quality-gate command surfaced by auto_work. */
	validationCommand: z.string().optional(),
	/** Privacy toggle: omit host/model from newly composed agent branch ids. */
	redactIdentity: z.boolean().optional(),
	/**
	 * How this project publishes a newly written proposal, as a command
	 * template (`{id}` and `{path}` are substituted). `create_proposal`
	 * returns it as the next action, so an agent never leaves a proposal
	 * untracked in a shared checkout where no other agent can see it.
	 */
	publishCommand: z.string().min(1).optional(),
	persist: z
		.object({
			mode: z.enum(['none', 'commit', 'commit-and-push']).default('none'),
			messageTemplate: z.string().optional(),
			pushTarget: z.string().optional(),
			allowForeignChanges: z.boolean().optional(),
			protectedBranches: z.array(z.string()).optional(),
		})
		.optional(),
	orchestration: z
		.object({
			delegateAfterToolCalls: z.number().int().positive().optional(),
		})
		.optional(),
	/**
	 * r00003 S9 (F9): host-specific proposal subfolders (relative to the
	 * proposals dir), e.g. `['paused/demos']`. delendai bakes none.
	 */
	proposalFolders: z.array(z.string()).optional(),
	/** Per-status folder layout. Unspecified statuses stay flat. */
	folderPolicy: z
		.record(
			z.enum([
				'ready',
				'in-progress',
				'review',
				'done',
				'paused',
				'blocked',
				'retired',
			]),
			z.union([
				z.enum(['flat', 'by-kind']),
				z.array(
					z.enum([
						'feat',
						'breaking',
						'fix',
						'refactor',
						'perf',
						'audit',
						'chore',
						'docs',
						'test',
						'infra',
						'spike',
						'legacy',
						'resume',
						'plan',
					]),
				),
			]),
		)
		.optional(),
	/**
	 * r00003 S7 + S9: host narrative-heading aliases for the proposal
	 * scaffold linter, as `[heading, canonicalSection]` tuples.
	 */
	proposalNarrativePatterns: z
		.array(z.tuple([z.string(), z.string()]))
		.optional(),
	/**
	 * a00069 S7: require independent peer approve before review→done.
	 * Default true when omitted (wired at register time).
	 */
	requirePeerReview: z.boolean().optional(),
	/**
	 * x00718: what makes a reviewer independent of the implementer —
	 * `instance` (the default: another agent, which may be another instance
	 * of the same model, so a project with one subscription can review its
	 * own work) or `model` (always a different model).
	 */
	reviewIndependence: z.enum(['model', 'instance']).optional(),
	/**
	 * Who may force a proposal past its gates: `agents` (the default, any
	 * caller) or `people`, where no tool call forces and a person who
	 * decides to skip a gate moves the file and merges by hand.
	 */
	forceTransitions: z.enum(['agents', 'people']).optional(),
	/**
	 * The language this project writes its documents in (`en`). Declared,
	 * a verdict's text in another language is refused: one proposal is
	 * read in one language. Undeclared, nothing is checked.
	 */
	documentationLanguage: z.enum(['en']).optional(),
	/**
	 * Select the validation scope for authoring operations. `scoped` keeps
	 * each agent on its declared slice files; `global` is for integration.
	 */
	validationScope: z.enum(['scoped', 'global']).optional(),
	/**
	 * How long one `close_slice` call waits for the declared gate before it
	 * answers `pending` with a handle to resume (milliseconds).
	 */
	closeGateWaitMs: z.number().int().positive().optional(),
	/**
	 * How long a gate run may take before it is stopped and reported as
	 * unverifiable, never as a pass (milliseconds).
	 */
	closeGateTimeoutMs: z.number().int().positive().optional(),
	/**
	 * Require a passing validation run before lifecycle operations. The
	 * selected scope applies to `close_slice`; terminal proposal transitions
	 * always retain the global integration gate. Default true when omitted.
	 */
	requireValidateEvidence: z.boolean().optional(),
	/**
	 * a00069 S10: auto-purge orphan registry/queue/lock drift on plugin boot.
	 * Default true. Set false to keep diagnose-only (manual state_repair).
	 */
	autoRepairOrphans: z.boolean().optional(),
	/**
	 * f00156: checkpoint-advisory thresholds. Augments existing plugin
	 * options rather than a parallel source of truth. Session age lives
	 * on usage-tracking.sessionHygiene.
	 */
	checkpointAdvisories: z
		.object({
			enabled: z.boolean().optional(),
			microValidation: z
				.object({
					equivalentRunsBeforeWarning: z
						.number()
						.int()
						.positive()
						.optional(),
				})
				.strict()
				.optional(),
			contextDrift: z
				.object({
					interactiveSeverity: z
						.enum(['recommend', 'strong'])
						.optional(),
				})
				.strict()
				.optional(),
			pushGuard: z
				.object({
					enabled: z.boolean().optional(),
				})
				.strict()
				.optional(),
		})
		.strict()
		.optional(),
});
