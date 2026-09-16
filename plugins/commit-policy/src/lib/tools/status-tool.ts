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
import { withOkEnvelope } from '@delendai/core/plugin';

import { STATUS_OUTPUT_SCHEMA } from '../contracts/constants/status-tool.constant';

import type { ICommitPolicyOptions } from '../contracts/options';
import { isBranchProtected } from '../contracts/branch';
import { resolveProtectedBranches } from '../contracts/constants/protected-branches';
import { localizedString } from '../contracts/i18n-types';
import type { IIdentityResolverContext } from '../identity/resolver';
import { resolveAuthor } from '../identity/resolver';
import {
	gitCurrentBranch,
	gitUnpushedCommitCount,
} from '../services/git-extra';
import type { BranchProtectionAdapter } from '../services/branch-protection-adapter';

export interface IStatusToolOptions {
	readonly namespacePrefix: string;
	readonly options: ICommitPolicyOptions;
	readonly identityCtx: IIdentityResolverContext;
	readonly branchProtectionAdapter?: BranchProtectionAdapter | undefined;
	/** BCP-47 locale tag (`en`, `es`, …). Defaults to English. */
	readonly locale?: string | undefined;
}

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

	// S3: live ahead/upstream state for the status tool.
	// Two probes — gitUnpushedCommitCount for the count (returns 0
	// when no upstream), and a separate rev-parse to learn WHETHER
	// an upstream exists (so the report distinguishes "in sync" from
	// "no upstream configured").
	let aheadCount: number | null = null;
	let upstreamBranch: string | null = null;
	let aheadReason: string | null = null;
	const upstreamProbe = await options.identityCtx.run([
		'rev-parse',
		'--abbrev-ref',
		'@{upstream}',
	]);
	if (upstreamProbe.ok) {
		upstreamBranch = upstreamProbe.output.trim() || null;
		aheadCount = await gitUnpushedCommitCount(options.identityCtx.run);
	} else {
		aheadReason = 'no_upstream';
	}
	const needsAttention =
		aheadCount !== null &&
		aheadCount > 0 &&
		options.options.push.enabled &&
		!currentBranchProtected;

	const summary = localizedString(options.locale, (catalog) =>
		catalog.tools.status.summary({
			commitEnabled: options.options.commit.enabled,
			pushEnabled: options.options.push.enabled,
			triggerCount: options.options.cadence.triggers.length,
		}),
	);

	const payload = {
		summary,
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
			ahead: {
				count: aheadCount,
				upstream: upstreamBranch,
				needsAttention,
				reason: aheadReason,
			},
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

	const parseResult = STATUS_OUTPUT_SCHEMA.safeParse(payload);
	if (!parseResult.success) {
		return toolError(
			`commit_policy_status output schema mismatch: ${parseResult.error.message}`,
			'Report this as a plugin bug — the engine produced a payload that fails its own schema.',
		);
	}

	return toolOk({ ...payload });
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
				outputSchema: withOkEnvelope(STATUS_OUTPUT_SCHEMA),
				inputSchema: z.object({}),
			},
			async () => runCommitPolicyStatus(options),
		);
	},
});
