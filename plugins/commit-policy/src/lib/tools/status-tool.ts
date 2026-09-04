/**
 * status-tool.ts — `commit_policy_status`.
 *
 * Reports the plugin's effective configuration: identity mode,
 * effective author (if resolvable without side effects), enabled
 * triggers, push policy, audit policy. Cheap, read-only, callable
 * at any point in a session.
 *
 * The tool runs `resolveAuthor` once during the call (NOT at
 * register time) so the snapshot reflects the live environment at
 * the moment of the question — useful when an agent is debugging
 * "why did the last commit come from `unknown`?".
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolOk } from '@delendai/core/public';

import type { ICommitPolicyOptions } from '../contracts/options';
import { isBranchProtected } from '../contracts/branch';
import { resolveProtectedBranches } from '../contracts/constants/protected-branches';
import { localizedString } from '../contracts/i18n-types';
import type { IIdentityResolverContext } from '../identity/resolver';
import { resolveAuthor } from '../identity/resolver';
import { gitCurrentBranch } from '../services/git-extra';
import type { BranchProtectionAdapter } from '../services/branch-protection-adapter';

export interface IStatusToolOptions {
	readonly namespacePrefix: string;
	readonly options: ICommitPolicyOptions;
	readonly identityCtx: IIdentityResolverContext;
	readonly branchProtectionAdapter?: BranchProtectionAdapter | undefined;
	/** BCP-47 locale tag (`en`, `es`, …). Defaults to English. */
	readonly locale?: string | undefined;
}

const OutputSchema = z.object({
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

export const runCommitPolicyStatus = async (
	options: IStatusToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const identityResult = await resolveAuthor(
		options.options.identity,
		options.identityCtx,
	);
	const currentBranch = await gitCurrentBranch(options.identityCtx.run);
	const protectedBranches = resolveProtectedBranches(
		options.options.push.protectedBranches,
	);
	const protectedPrefixes = [
		...(options.options.push.protectedPrefixes ?? []),
	];
	const currentBranchProtected = isBranchProtected(currentBranch, {
		protected: protectedBranches,
		protectedPrefixes,
	});
	const remoteProtection = options.branchProtectionAdapter?.getLastResult();

	const payload = {
		commit: {
			enabled: options.options.commit.enabled,
			requireConventional: options.options.commit.requireConventional,
			autoScopeFromProposal: options.options.commit.autoScopeFromProposal,
			refuseWhenDisabled: options.options.commit.refuseWhenDisabled,
		},
		identity: {
			mode: options.options.identity.mode,
			effective: identityResult.ok ? identityResult.author : null,
			resolutionError: identityResult.ok ? null : identityResult.reason,
		},
		audit: {
			trailer: options.options.audit.trailer,
			agentFormat: options.options.audit.agentFormat,
		},
		cadence: {
			triggerCount: options.options.cadence.triggers.length,
			triggers: options.options.cadence.triggers.map((trigger) => {
				const base = { kind: trigger.kind } as {
					kind: string;
					files?: number;
					minutes?: number;
					onStatuses?: string[];
				};
				if (trigger.kind === 'threshold') base.files = trigger.files;
				else if (trigger.kind === 'interval')
					base.minutes = trigger.minutes;
				else if (trigger.kind === 'slice')
					base.onStatuses = [...trigger.onStatuses];
				return base;
			}),
			sliceScoping: options.options.cadence.sliceScoping,
			allowForeignChanges: options.options.cadence.allowForeignChanges,
		},
		push: {
			enabled: options.options.push.enabled,
			onCommit: options.options.push.onCommit,
			...(options.options.push.everyNCommits !== undefined
				? { everyNCommits: options.options.push.everyNCommits }
				: {}),
			...(options.options.push.everyNMinutes !== undefined
				? { everyNMinutes: options.options.push.everyNMinutes }
				: {}),
			force: options.options.push.force,
			protectedBranches: [...protectedBranches],
			...(options.options.push.remote !== undefined
				? { remote: options.options.push.remote }
				: {}),
			...(options.options.push.branch !== undefined
				? { branch: options.options.push.branch }
				: {}),
		},
		branchPolicy: {
			current: currentBranch ?? null,
			protectedBranches,
			protectedPrefixes,
			directCommitPushAllowed: !currentBranchProtected,
			remote:
				remoteProtection === undefined
					? null
					: remoteProtection.ok
						? {
								ok: true,
								state: remoteProtection.state,
								provider: remoteProtection.provider,
								remoteName: remoteProtection.remoteName,
								remoteHost: remoteProtection.remoteHost,
								remoteBranches: [
									...remoteProtection.remoteBranches,
								],
								effectiveBranches: [
									...remoteProtection.effectiveBranches,
								],
							}
						: {
								ok: false,
								state: remoteProtection.state,
								...(remoteProtection.provider !== undefined
									? { provider: remoteProtection.provider }
									: {}),
								...(remoteProtection.remoteName !== undefined
									? {
											remoteName:
												remoteProtection.remoteName,
										}
									: {}),
								...(remoteProtection.remoteHost !== undefined
									? {
											remoteHost:
												remoteProtection.remoteHost,
										}
									: {}),
								remoteBranches: [
									...remoteProtection.remoteBranches,
								],
								effectiveBranches: [
									...remoteProtection.effectiveBranches,
								],
								reason: remoteProtection.reason,
							},
		},
		locale: options.locale ?? 'en',
	};

	const parseResult = OutputSchema.safeParse(payload);
	if (!parseResult.success) {
		return toolError(
			`commit_policy_status output schema mismatch: ${parseResult.error.message}`,
			'Report this as a plugin bug — the engine produced a payload that fails its own schema.',
		);
	}

	const summary = localizedString(options.locale, (catalog) =>
		catalog.tools.status.summary({
			commitEnabled: options.options.commit.enabled,
			pushEnabled: options.options.push.enabled,
			triggerCount: options.options.cadence.triggers.length,
		}),
	);

	return toolOk({
		ok: true,
		summary,
		...payload,
	});
};

export const buildStatusToolRegistration = (
	options: IStatusToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_status',
	summary:
		'Show the effective commit-policy configuration, including which branches are protected and whether direct commit/push is allowed on the current branch.',
	tags: ['commit-policy', 'status', 'read-only'],
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_status`,
			{
				description:
					'Read-only snapshot of commit-policy. Inspect branchPolicy before committing or pushing: protected branches refuse direct automation; other branches allow direct commit/push when enabled.',
				outputSchema: OutputSchema,
				inputSchema: z.object({}),
			},
			async () => runCommitPolicyStatus(options),
		);
	},
});
