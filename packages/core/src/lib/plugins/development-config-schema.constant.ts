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
 */

import { z } from 'zod';

const strategy = () => z.string().min(1).optional();
const wholeNumber = () => z.number().int().nonnegative().optional();

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
		profile: z.string().min(1).optional(),
		branches: z
			.object({
				integration: z.string().min(1).optional(),
				publicationRefPrefix: z.string().optional(),
				foreignRefPrefixes: z.array(z.string()).optional(),
				release: z.string().min(1).optional(),
				workRefTemplate: z.string().optional(),
				workRefPrefix: z.string().optional(),
			})
			.strict()
			.optional(),
		workspace: z.object({ strategy: strategy() }).strict().optional(),
		persistence: z
			.object({
				strategy: strategy(),
				// Durability is the operator's call, not a consequence of
				// any strategy, so unlike the capability booleans these
				// two are authorable. Both default ON in every profile.
				autoCommitOnTask: z.boolean().optional(),
				autoPushAfterCommit: z.boolean().optional(),
			})
			.strict()
			.optional(),
		checkpoint: z
			.object({
				strategy: strategy(),
				intervalMinutes: wholeNumber(),
				durableWip: z.boolean().optional(),
			})
			.strict()
			.optional(),
		integration: z
			.object({
				strategy: strategy(),
				requiredChecks: z.array(z.string().min(1)).optional(),
				requireLatestIntegration: z.boolean().optional(),
				mergeGreenProgressContinuously: z.boolean().optional(),
				requiredApprovals: wholeNumber(),
				releaseRequiredApprovals: wholeNumber(),
				releaseRequiredChecks: z.array(z.string().min(1)).optional(),
				mergeMethod: z.string().min(1).optional(),
				deleteMergedWorkRef: z.boolean().optional(),
				linearHistory: z.boolean().optional(),
				allowForcePush: z.boolean().optional(),
				allowDeleteIntegrationBranch: z.boolean().optional(),
			})
			.strict()
			.optional(),
		coordination: z
			.object({ strategy: strategy(), leaseTtlMinutes: wholeNumber() })
			.strict()
			.optional(),
		recovery: z
			.object({
				strategy: strategy(),
				neverDiscardUnmergedWork: z.boolean().optional(),
			})
			.strict()
			.optional(),
		governance: z
			.object({
				strategy: strategy(),
				failClosedOnUnverifiable: z.boolean().optional(),
			})
			.strict()
			.optional(),
	})
	.strict()
	.optional();
