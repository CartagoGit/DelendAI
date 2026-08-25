/**
 * push-tool.ts — `commit_policy_push`.
 *
 * Tool wrapper over `runPushDriver`. Composes the MCP surface
 * (input/output zod, toolOk/toolError) and nothing else.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolOk } from '@mcp-vertex/core/public';

import type { ICommitPolicyOptions } from '../contracts/options';
import { localizedString } from '../contracts/i18n-types';
import { runPushDriver, type IPushDriverInput } from '../services/push-driver';

export interface IPushToolOptions {
	readonly namespacePrefix: string;
	readonly policy: ICommitPolicyOptions;
	readonly run: Parameters<typeof runPushDriver>[2];
	readonly locale?: string | undefined;
}

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
});

export const runCommitPolicyPush = async (
	args: z.infer<typeof InputSchema>,
	options: IPushToolOptions,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const input: IPushDriverInput = {
		...(args.remote !== undefined ? { remote: args.remote } : {}),
		...(args.branch !== undefined ? { branch: args.branch } : {}),
		...(args.force !== undefined ? { force: args.force } : {}),
	};
	const result = await runPushDriver(input, options.policy.push, options.run);

	const parseResult = OutputSchema.safeParse({
		ok: result.ok,
		pushed: result.ok ? result.pushed : false,
		...(result.ok
			? { remote: result.remote, branch: result.branch }
			: { refusal: result.refusal }),
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
			if (result.refusal.includes('protectedBranches')) {
				return {
					summary: catalog.tools.push.refuseProtected({
						branch: result.refusal.match(/"([^"]+)"/)?.[1] ?? '',
					}),
					nextAction: catalog.tools.push.nextActionProtected,
				};
			}
			return {
				summary: result.refusal,
				nextAction: catalog.tools.push.refuseNotImplemented,
			};
		});
		return toolError(localized.summary, localized.nextAction);
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
					'Pushes remote/branch (defaults to the configured remote + branch, then upstream, then current branch). Refuses to push to a branch in protectedBranches (default: main, master). `force` defaults to the configured policy (`with-lease` by default; `never` omits --force entirely; `allow` uses --force). Write effect.',
				outputSchema: OutputSchema,
				inputSchema: InputSchema,
			},
			async (args) => runCommitPolicyPush(args, options),
		);
	},
});
