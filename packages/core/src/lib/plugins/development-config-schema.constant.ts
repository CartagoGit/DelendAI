/**
 * development-config-schema.ts — the shape of the `development` block in
 * `delendai.config.json`.
 *
 * Split out of `config-file-schema.ts` because it is a self-contained
 * sub-language: eight orthogonal strategy axes plus their tuning knobs.
 * Keeping it inline pushed the parent file past the SRP ceiling and, more
 * importantly, buried the one block an operator actually edits when
 * choosing a development model inside a file about plugin registration.
 *
 * Every `strategy` is deliberately `z.string()` rather than `z.enum()`.
 * Zod would reject a typo with "invalid enum value", which says nothing
 * about what the operator meant; passing unknown vocabulary through to
 * `validateDevelopmentPolicy` instead produces a diagnostic that names
 * the rule, the config path and a concrete remedy.
 *
 * Every property carries a `.describe(...)`, because that prose is what
 * reaches the person editing `delendai.config.json`: the JSON Schema
 * generated from this file is what an editor offers as autocomplete, and
 * a field that says nothing beyond its own name teaches a newcomer
 * nothing. The enums carry their per-value prose in `config-schema-docs.ts`,
 * so a value added without a sentence is a compile error rather than a
 * gap somebody notices months later.
 */

import { z } from 'zod';

import { PUBLICATION_GRANULARITIES } from '../contracts/constants/publication-granularity.constant';
import {
	GUARD_HOOKS_DOCS,
	GUARD_UNKNOWN_ACTOR_DOCS,
	IDENTITY_UNVERIFIED_CLAIMS_DOCS,
	PUBLICATION_GRANULARITY_DOCS,
	WORK_REFS_VISIBILITY_DOCS,
	documentedEnum,
} from './config-schema-docs';

const strategy = (description: string) =>
	z.string().min(1).describe(description).optional();
const wholeNumber = (description: string) =>
	z.number().int().nonnegative().describe(description).optional();

/**
 * `unverifiedClaims` stays a plain string on purpose: a typo should be
 * named by `validateDevelopmentPolicy` with a remedy, not rejected by
 * Zod. Its two values are documented with the other enums, so their
 * prose is borrowed here rather than restated.
 */
const UNVERIFIED_CLAIMS_DESCRIPTION =
	'What a model id the agent declared about itself may do: `accept` — ' +
	IDENTITY_UNVERIFIED_CLAIMS_DOCS.accept +
	' `refuse` — ' +
	IDENTITY_UNVERIFIED_CLAIMS_DOCS.refuse;

/**
 * The canonical development policy: how this workspace develops and
 * integrates work. Everything else that used to answer that question —
 * the legacy `agentWorktree` flag, the `commit-policy` options, the
 * generated forge settings, the branch guards — now derives from what is
 * resolved here.
 *
 * Omit the block entirely and the pre-policy fields are mapped through
 * the compatibility layer, so an existing project keeps its historical
 * behaviour on upgrade. Name a `profile` for the common shapes and
 * override individual axes as needed; the axes are orthogonal on
 * purpose, so a new combination never requires a new mode. Combinations
 * that cannot be honoured are rejected at startup with a concrete
 * diagnostic rather than improvised.
 */
export const DEVELOPMENT_CONFIG_SCHEMA = z
	.object({
		profile: z
			.string()
			.min(1)
			.describe(
				'The preset that expands into the whole policy below: `shared-direct`, `shared-checkout-pr`, `shared-checkout-merge` or `worktree-pr`. Omit it to write the axes by hand, or name one and override only the axes that differ.',
			)
			.optional(),
		guardHooks: documentedEnum(
			['install', 'report', 'off'],
			GUARD_HOOKS_DOCS,
		)
			.describe(
				'What the server does about the git hooks that enforce this policy: install or update them on start (the default), only report whether they are there, or leave the repository alone.',
			)
			.optional(),
		guard: z
			.object({
				unknownActor: documentedEnum(
					['agent', 'person'],
					GUARD_UNKNOWN_ACTOR_DOCS,
				)
					.describe(
						'Who the git guard assumes an actor to be when nothing identifies it.',
					)
					.optional(),
			})
			.strict()
			.describe(
				'How the git guard judges a writer it cannot identify. Omit it to keep the default.',
			)
			.optional(),
		/**
		 * How work is attributed to a model when nothing declared one
		 * (f00758). `providerBridge: false` closes the bridge PR #1037
		 * opened, so declared model ids are the only way in.
		 */
		identity: z
			.object({
				providerBridge: z
					.boolean()
					.describe(
						'Whether a model the provider bridge observed counts when work is attributed. Set it to `false` to make declared model ids the only way in; omit it to accept both.',
					)
					.optional(),
				aliases: z
					.record(
						z.string().min(1),
						z
							.string()
							.min(1)
							.describe(
								'The model id the spelling names, such as `minimax-m3.1-flash-preview`.',
							),
					)
					.describe(
						'Spellings this project knows name one model, as a map from spelling to model id — `"minimax-3.1": "minimax-m3.1-flash-preview"`. Use it when a machine never saw the model in an editor, so the seen-model catalogue cannot resolve it.',
					)
					.optional(),
				unrecognizedModel: z
					.union([
						z
							.string()
							.min(1)
							.describe(
								'The policy for an identity nothing named a model. `refuse` is the only implemented value: the work is attributed to nobody.',
							),
						z
							.object({
								use: z
									.string()
									.min(1)
									.describe(
										'The agent id the work is attributed to, normalised like any other agent id.',
									),
							})
							.strict()
							.describe(
								'Name the work after an id instead of refusing it, so a project that does not care which model worked still gets readable refs and authors.',
							),
					])
					.describe(
						'What an identity nothing named a model becomes: either refuse to attribute the work at all, or name it with the `{ "use": "..." }` form.',
					)
					.optional(),
				// 'accept' (default) or 'refuse': whether a model id the agent
				// declared about itself counts when nothing observed it.
				unverifiedClaims: z
					.string()
					.min(1)
					.describe(UNVERIFIED_CLAIMS_DESCRIPTION)
					.optional(),
			})
			.strict()
			.describe(
				'How work is attributed to a model when nothing declared one: which sources count, what an unnamed identity becomes, and what a self-declared model id may do.',
			)
			.optional(),
		workRefs: z
			.object({
				visibility: documentedEnum(
					['visible', 'hidden'],
					WORK_REFS_VISIBILITY_DOCS,
				)
					.describe(
						'Whether the refs that carry in-progress work show up in the ordinary ref list.',
					)
					.optional(),
			})
			.strict()
			.describe(
				'Whether the refs that carry in-progress work are ordinary branches or an implementation detail.',
			)
			.optional(),
		branches: z
			.object({
				namespacePrefix: z
					.string()
					.describe(
						'The namespace for the refs delendai owns, with no trailing slash: empty gives `wip/` and `pr/`, `delendai` gives `delendai/wip/` and `delendai/pr/`. Change it when two projects share a remote and their refs would collide.',
					)
					.optional(),
				integration: z
					.string()
					.min(1)
					.describe(
						'The branch agents integrate into — `develop` here, never the forge’s default branch by accident. Set it to the branch your forge treats as the integration target.',
					)
					.optional(),
				publicationRefPrefix: z
					.string()
					.describe(
						'The namespace for the refs that exist only to carry a pull request, such as `delendai/pr/`. Naming them apart from development branches is what makes it checkable that an agent did not take a branch of its own.',
					)
					.optional(),
				foreignRefPrefixes: z
					.array(
						z
							.string()
							.describe(
								'A prefix delendai does not own, such as the namespace the forge’s own automation uses.',
							),
					)
					.describe(
						'Ref prefixes delendai does not own and must never reap — the forge’s own automation, chiefly. Set it when a cleanup would otherwise mistake a foreign ref for abandoned work.',
					)
					.optional(),
				release: z
					.string()
					.min(1)
					.describe(
						'The branch releases land on. Omit it, or name the integration branch, for a project with one branch.',
					)
					.optional(),
				workRefTemplate: z
					.string()
					.describe(
						'The template that names the ref of one unit of work, built from the placeholders `${agent}`, `${kind}`, `${proposal}`, `${slice}`, `${generation}` and `${topic}`. It must contain `${generation}`, or successive checkpoints of one slice collide on the same ref.',
					)
					.optional(),
				workRefPrefix: z
					.string()
					.describe(
						'The prefix a reaper may consider managed when it cleans up abandoned work. Leave it empty to disable that cleanup entirely.',
					)
					.optional(),
			})
			.strict()
			.describe(
				'The branch and ref names this policy uses: where work integrates, where releases land, and what the delendai-owned refs are called.',
			)
			.optional(),
		workspace: z
			.object({
				strategy: strategy(
					'How work reaches the filesystem: the strategy that decides what a work unit owns and where it lives. `shared-checkout` gives every agent the same tree; `agent-worktree` gives each one a tree of its own.',
				),
			})
			.strict()
			.describe('How the agents get a working tree to edit.')
			.optional(),
		persistence: z
			.object({
				strategy: strategy(
					'How unfinished work is written down: the strategy that decides whether the work lands as a direct commit, in a `wip/*` ref, or on a branch of its own.',
				),
				// Durability is the operator's call, not a consequence of
				// any strategy, so unlike the capability booleans these
				// two are authorable. Both default ON in every profile.
				autoCommitOnTask: z
					.boolean()
					.describe(
						'Whether finishing a unit of work commits it without being asked. It defaults on in every profile, because work that exists only as unsaved edits in a shared tree can be lost by any other agent’s operation. Turn it off only when a person commits by hand.',
					)
					.optional(),
				autoPushAfterCommit: z
					.boolean()
					.describe(
						'Whether that commit is pushed as soon as it is made. Local durability is not durability: a checkpoint that lives only in this clone cannot be resumed by another agent, cannot be reviewed, and disappears with the machine.',
					)
					.optional(),
			})
			.strict()
			.describe('Where an agent’s in-progress work is durably written.')
			.optional(),
		checkpoint: z
			.object({
				strategy: strategy(
					'When a durability checkpoint is written: on slice boundaries, on a fixed interval, or on both — whichever comes first.',
				),
				intervalMinutes: wholeNumber(
					'The minutes between interval checkpoints. It applies only when the checkpoint strategy includes `interval`, and 0 means no interval at all.',
				),
				durableWip: z
					.boolean()
					.describe(
						'Whether a checkpoint may be written even when the work is red. A durability checkpoint exists so the work is not lost; it is never merged.',
					)
					.optional(),
			})
			.strict()
			.describe(
				'When the work in progress is written down, so that a crash does not lose it.',
			)
			.optional(),
		integration: z
			.object({
				strategy: strategy(
					'How work reaches the integration branch: the strategy that decides whether a candidate is pushed directly, opened as a pull request, or merged from a work ref after local certification.',
				),
				requiredChecks: z
					.array(
						z
							.string()
							.min(1)
							.describe(
								'The name of a check context the forge runs, such as `build`.',
							),
					)
					.describe(
						'The check contexts that must pass before a candidate may land on the integration branch. Leave it empty to let the forge decide.',
					)
					.optional(),
				requireLatestIntegration: z
					.boolean()
					.describe(
						'Whether a candidate must be re-validated against the CURRENT integration head before it merges, not merely against the head it was branched from. Turn it on to stop two independently-green candidates from combining into a red branch.',
					)
					.optional(),
				mergeGreenProgressContinuously: z
					.boolean()
					.describe(
						'Whether a coherent, green part of a slice is integrated as soon as it is ready, instead of waiting for the whole slice.',
					)
					.optional(),
				publication: z
					.object({
						granularity: documentedEnum(
							PUBLICATION_GRANULARITIES,
							PUBLICATION_GRANULARITY_DOCS,
						)
							.describe(
								'How much work one publication carries: a slice, a whole proposal, or whichever fits under the adaptive thresholds.',
							)
							.optional(),
						adaptive: z
							.object({
								maxSlices: wholeNumber(
									'The most slices a proposal may have and still be published as one pull request.',
								),
								maxChangedLines: wholeNumber(
									'The most changed lines, added plus removed, across a proposal’s slices and still be published as one pull request.',
								),
							})
							.strict()
							.describe(
								'The thresholds that decide when `adaptive` granularity publishes a proposal whole and when it publishes it slice by slice.',
							)
							.optional(),
					})
					.strict()
					.describe(
						'How finished work is grouped into pull requests.',
					)
					.optional(),
				requiredApprovals: wholeNumber(
					'The approving human reviews a candidate needs before it may merge into the integration branch. 0 means autonomous integration: certified, green work lands without waiting for a person.',
				),
				releaseRequiredApprovals: wholeNumber(
					'The same for the release branch, held separately because promoting to release is where a project most often wants a human in the loop. It may not be lower than `requiredApprovals`.',
				),
				releaseRequiredChecks: z
					.array(
						z
							.string()
							.min(1)
							.describe(
								'The name of a check context the release branch runs, such as a version gate.',
							),
					)
					.describe(
						'The checks the RELEASE branch requires, when they differ from the integration branch’s — a version gate, a changelog check. Leave it empty to use the same list as `requiredChecks`.',
					)
					.optional(),
				mergeMethod: z
					.string()
					.min(1)
					.describe(
						'The merge shape the forge performs: `squash`, `merge` or `rebase`.',
					)
					.optional(),
				deleteMergedWorkRef: z
					.boolean()
					.describe(
						'Whether the work ref is deleted once its work has landed. Turn it off when the ref is also the record of the work and should be kept.',
					)
					.optional(),
				linearHistory: z
					.boolean()
					.describe(
						'Whether the integration branch must keep a linear history, with no merge commits in it.',
					)
					.optional(),
				allowForcePush: z
					.boolean()
					.describe(
						'Whether an agent may rewrite history on the integration branch. Keep it off unless the project genuinely rewrites published work.',
					)
					.optional(),
				allowDeleteIntegrationBranch: z
					.boolean()
					.describe(
						'Whether the integration branch itself may be deleted. Almost always off: the integration branch is the one branch the project must not lose.',
					)
					.optional(),
			})
			.strict()
			.describe(
				'How finished work reaches the integration branch, and what has to be true before it lands.',
			)
			.optional(),
		coordination: z
			.object({
				strategy: strategy(
					'How concurrent agents are kept apart: the strategy that decides whether ownership is advisory, locked on disk, or leased transactionally in the operational state.',
				),
				leaseTtlMinutes: wholeNumber(
					'The minutes before a lease nobody renewed is treated as dead. 0 means a lease never expires.',
				),
				roster: z
					.array(
						z
							.string()
							.min(1)
							.describe(
								'The identity of one agent or person allowed to work here.',
							),
					)
					.describe(
						'Who may work here, as whoever launches the agents declares them. Leave it out to let anyone work.',
					)
					.optional(),
			})
			.strict()
			.describe('How concurrent agents avoid clobbering each other.')
			.optional(),
		recovery: z
			.object({
				strategy: strategy(
					'What happens to abandoned work: the strategy that decides whether it is forgotten or picked up by a new owner.',
				),
				neverDiscardUnmergedWork: z
					.boolean()
					.describe(
						'Whether unmerged work is never deleted on age alone — only on durable evidence that it is already represented in the integration branch, or on an explicit deprecation.',
					)
					.optional(),
			})
			.strict()
			.describe('What happens to work whose owner disappeared.')
			.optional(),
		governance: z
			.object({
				strategy: strategy(
					'How the runtime treats the forge’s own settings: the strategy that decides whether they are ignored, only observed and reported as drift, or reconciled against this policy.',
				),
				failClosedOnUnverifiable: z
					.boolean()
					.describe(
						'Whether a forge property that could not be evaluated is reported as a failure instead of quietly as a pass. Keep it on wherever the forge’s settings are enforced.',
					)
					.optional(),
			})
			.strict()
			.describe(
				'How much authority the runtime has over the forge’s own settings.',
			)
			.optional(),
	})
	.strict()
	.describe(
		'How this workspace develops and integrates work: the policy every other setting derives from. Omit it and the historical behaviour is kept; name a `profile` for a common shape, or write the axes below by hand.',
	)
	.optional();
