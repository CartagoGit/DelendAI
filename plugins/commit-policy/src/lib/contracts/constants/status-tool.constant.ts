/**
 * The advertised output shape of `commit_policy_status`.
 *
 * It lives here rather than beside the tool because `types-in-contracts`
 * keeps exported types and constants in `contracts/`, and the spec needs
 * to assert the schema the tool actually advertises:
 *
 *     withOkEnvelope(STATUS_OUTPUT_SCHEMA).strict().parse(structuredContent)
 *
 * `ok` is NOT declared here on purpose: `toolOk` supplies the envelope,
 * and `withOkEnvelope` adds it at registration, so the payload schema
 * stays exactly what the service returns.
 */
import z from 'zod';

export const STATUS_OUTPUT_SCHEMA = z.object({
	/**
	 * Sent on every answer, and undeclared until now. The handler built it
	 * AFTER validating `payload` against this schema, so its own
	 * `safeParse` never saw the field and agreed with a schema that a
	 * client listing tools would reject: the advertised JSON Schema
	 * forbids undeclared keys.
	 */
	summary: z.string(),
	commit: z.object({
		enabled: z.boolean(),
		requireConventional: z.boolean(),
		autoScopeFromProposal: z.boolean(),
		refuseWhenDisabled: z.boolean(),
	}),
	identity: z.object({
		mode: z.string(),
		effective: z
			.object({
				authorFlag: z.string(),
				displayName: z.string(),
				email: z.string(),
				label: z.string(),
			})
			.nullable(),
		resolutionError: z.string().nullable(),
	}),
	audit: z.object({
		trailer: z.string(),
		agentFormat: z.string(),
	}),
	cadence: z.object({
		triggerCount: z.number(),
		triggers: z.array(
			z.object({
				kind: z.string(),
				files: z.number().optional(),
				minutes: z.number().optional(),
				onStatuses: z.array(z.string()).optional(),
			}),
		),
		sliceScoping: z.boolean(),
		allowForeignChanges: z.boolean(),
	}),
	push: z.object({
		enabled: z.boolean(),
		onCommit: z.boolean(),
		everyNCommits: z.number().optional(),
		everyNMinutes: z.number().optional(),
		force: z.string(),
		protectedBranches: z.array(z.string()),
		remote: z.string().optional(),
		branch: z.string().optional(),
		/**
		 * x00427 S3: live reconciliation state — does the branch
		 * have commits that the upstream doesn't? `null` when no
		 * upstream is configured (the branch is local-only and
		 * reconciliation is N/A). `needsAttention` is true when
		 * push is enabled AND there are unpushed commits AND the
		 * branch isn't protected — i.e. the silent-stale-state
		 * condition that S1+S2 fixed.
		 */
		ahead: z.object({
			count: z.number().nullable(),
			upstream: z.string().nullable(),
			needsAttention: z.boolean(),
			reason: z.string().nullable(),
		}),
	}),
	branchPolicy: z.object({
		current: z.string().nullable(),
		protectedBranches: z.array(z.string()),
		protectedPrefixes: z.array(z.string()),
		directCommitPushAllowed: z.boolean(),
		remote: z
			.object({
				ok: z.boolean(),
				state: z.enum(['fresh', 'stale', 'unsupported', 'error']),
				provider: z.enum(['github', 'gitlab', 'unknown']).optional(),
				remoteName: z.string().optional(),
				remoteHost: z.string().optional(),
				remoteBranches: z.array(z.string()),
				effectiveBranches: z.array(z.string()),
				reason: z.string().optional(),
			})
			.nullable(),
	}),
	locale: z.string(),
});
