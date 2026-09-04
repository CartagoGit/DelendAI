/**
 * push-tool.ts — `commit_policy_push`.
 *
 * Tool wrapper over `runPushDriver`. Composes the MCP surface
 * (input/output zod, toolOk/toolError) and nothing else.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson, toolOk } from '@delendai/core/public';

import {
	BRANCH_PROTECTED_REFUSAL_CODE,
	classifyRefusal,
	refusalHasCode,
} from '../contracts/branch';
import type { ICommitPolicyOptions } from '../contracts/options';
import { localizedString } from '../contracts/i18n-types';
import {
	resolveAuthor,
	type IIdentityResolverContext,
} from '../identity/resolver';
import { runPushDriver, type IPushDriverInput } from '../services/push-driver';
import { withGitWriteLock } from '../services/git-write-lock';

export interface IPushToolOptions {
	readonly namespacePrefix: string;
	readonly policy: ICommitPolicyOptions;
	readonly run: Parameters<typeof runPushDriver>[2];
	readonly workspaceRoot?: string | undefined;
	readonly pluginCacheDir?: string | undefined;
	/**
	 * Needed only to name the principal accountable for a plain
	 * `--force` push. Optional so a host that never enables
	 * `push.force: "allow"` is unaffected.
	 */
	readonly identityCtx?: IIdentityResolverContext | undefined;
	readonly locale?: string | undefined;
}

const pushToolFallbackNextAction = (refusal: string): string => {
	if (refusal.includes('push.forceReason')) {
		return 'Set push.forceReason in the config before allowing a plain --force push.';
	}
	if (refusal.includes('identity')) {
		return 'Resolve an identity for the caller or avoid push.force="allow".';
	}
	if (refusal.includes('could not resolve remote/branch')) {
		return 'Pass remote and branch explicitly, configure push.remote/push.branch, or set an upstream.';
	}
	if (refusal.includes('could not resolve remote')) {
		return 'Configure push.remote or pass a concrete remote before retrying.';
	}
	return 'Inspect the refusal detail, fix the local precondition, and retry the push.';
};

/**
 * Resolve who authorizes a plain `--force` push. Only consulted when the
 * effective force mode is `allow`, so the identity lookup (which shells
 * out to git) never runs on the ordinary push path.
 */
const resolveAuthorizedBy = async (
	options: IPushToolOptions,
	effectiveForce: ICommitPolicyOptions['push']['force'],
): Promise<string | undefined> => {
	if (effectiveForce !== 'allow') return undefined;
	if (options.identityCtx === undefined) return undefined;
	const resolution = await resolveAuthor(
		options.policy.identity,
		options.identityCtx,
	);
	return resolution.ok ? resolution.author.displayName : undefined;
};

const InputSchema = z.object({
	remote: z.string().optional(),
	branch: z.string().optional(),
	force: z.enum(['with-lease', 'allow', 'never']).optional(),
});

const OutputSchema = z.object({
	ok: z.boolean(),
	pushed: z.boolean(),
	remote: z.string().optional(),
	branch: z.string().optional(),
	refusal: z.string().optional(),
	code: z.string().optional(),
});

export const runCommitPolicyPush = async (
	args: z.infer<typeof InputSchema>,
	options: IPushToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const effectiveForce = args.force ?? options.policy.push.force;
	const authorizedBy = await resolveAuthorizedBy(options, effectiveForce);
	const input: IPushDriverInput = {
		...(args.remote !== undefined ? { remote: args.remote } : {}),
		...(args.branch !== undefined ? { branch: args.branch } : {}),
		...(args.force !== undefined ? { force: args.force } : {}),
		...(authorizedBy !== undefined ? { authorizedBy } : {}),
	};
	const result = await withGitWriteLock(
		options.workspaceRoot,
		options.pluginCacheDir,
		() => runPushDriver(input, options.policy.push, options.run),
	);

	const parseResult = OutputSchema.safeParse({
		ok: result.ok,
		pushed: result.ok ? result.pushed : false,
		...(result.ok
			? { remote: result.remote, branch: result.branch }
			: {
					refusal: result.refusal,
					code: result.code ?? classifyRefusal(result.refusal),
				}),
	});
	if (!parseResult.success) {
		return toolError(
			`commit_policy_push output schema mismatch: ${parseResult.error.message}`,
			'Report this as a plugin bug.',
		);
	}

	if (!result.ok) {
		const localized = localizedString(options.locale, (catalog) => {
			if (result.refusal.includes('push.enabled')) {
				return {
					summary: catalog.tools.push.refuseDisabled,
					nextAction: catalog.tools.push.nextActionDisabled,
				};
			}
			if (refusalHasCode(result.refusal, BRANCH_PROTECTED_REFUSAL_CODE)) {
				return {
					summary: catalog.tools.push.refuseProtected({
						branch: result.refusal.match(/"([^"]+)"/)?.[1] ?? '',
					}),
					nextAction: catalog.tools.push.nextActionProtected,
				};
			}
			return {
				summary: result.refusal,
				nextAction: pushToolFallbackNextAction(result.refusal),
			};
		});
		const error = {
			ok: false as const,
			error: {
				reason: localized.summary,
				nextAction: localized.nextAction,
				code: result.code ?? classifyRefusal(result.refusal),
			},
		};
		return { ...toolJson(error), isError: true };
	}

	const successMessage = localizedString(options.locale, (catalog) =>
		catalog.tools.push.success({ remote: result.remote }),
	);

	return toolOk({
		...parseResult.data,
		message: successMessage,
	});
};

export const buildPushToolRegistration = (
	options: IPushToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_push',
	summary:
		'Push through the policy engine: respects protectedBranches, force policy (with-lease|allow|never), and push.enabled master switch.',
	tags: ['commit-policy', 'push', 'write'],
	effects: ['write'],
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_push`,
			{
				description:
					'Pushes remote/branch (defaults to the configured remote + branch, then upstream, then current branch). Refuses to push to a branch in the configured protectedBranches or protectedPrefixes. Empty protection lists protect no branch. `force` defaults to the configured policy (`with-lease` by default; `never` omits --force entirely; `allow` uses --force). Write effect.',
				outputSchema: OutputSchema,
				inputSchema: InputSchema,
			},
			async (args) => runCommitPolicyPush(args, options),
		);
	},
});
