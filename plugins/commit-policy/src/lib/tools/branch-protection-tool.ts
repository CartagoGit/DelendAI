import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import {
	toolError,
	toolOk,
	type IToolRegistration,
} from '@mcp-vertex/core/public';

import type {
	BranchProtectionAdapter,
	BranchProtectionRefreshResult,
} from '../services/branch-protection-adapter';

const OutputSchema = z.object({
	ok: z.boolean(),
	state: z.enum(['fresh', 'stale', 'unsupported', 'error']),
	provider: z.enum(['github', 'gitlab', 'unknown']).optional(),
	remoteName: z.string().optional(),
	remoteHost: z.string().optional(),
	remoteBranches: z.array(z.string()),
	effectiveBranches: z.array(z.string()),
	reason: z.string().optional(),
});

export interface IBranchProtectionToolOptions {
	readonly namespacePrefix: string;
	readonly adapter: BranchProtectionAdapter;
}

const toPayload = (result: BranchProtectionRefreshResult) =>
	result.ok
		? {
				ok: true,
				state: result.state,
				provider: result.provider,
				remoteName: result.remoteName,
				remoteHost: result.remoteHost,
				remoteBranches: [...result.remoteBranches],
				effectiveBranches: [...result.effectiveBranches],
			}
		: {
				ok: false,
				state: result.state,
				...(result.provider !== undefined
					? { provider: result.provider }
					: {}),
				...(result.remoteName !== undefined
					? { remoteName: result.remoteName }
					: {}),
				...(result.remoteHost !== undefined
					? { remoteHost: result.remoteHost }
					: {}),
				remoteBranches: [...result.remoteBranches],
				effectiveBranches: [...result.effectiveBranches],
				reason: result.reason,
			};

export const runBranchProtectionRefresh = async (
	adapter: BranchProtectionAdapter,
): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> => {
	const result = await adapter.refresh();
	const payload = toPayload(result);
	const parsed = OutputSchema.safeParse(payload);
	if (!parsed.success) {
		return toolError(
			`commit_policy_refresh_branch_protection output schema mismatch: ${parsed.error.message}`,
			'Report this as a plugin bug.',
		);
	}
	return toolOk(parsed.data);
};

export const buildBranchProtectionToolRegistration = (
	options: IBranchProtectionToolOptions,
): IToolRegistration => ({
	id: 'commit_policy_refresh_branch_protection',
	summary: 'Refresh protected branches from the configured forge provider.',
	tags: ['commit-policy', 'branch-protection', 'network'],
	effects: ['network', 'spawn'],
	register: async (server: McpServer) => {
		server.registerTool(
			`${options.namespacePrefix}_commit_policy_refresh_branch_protection`,
			{
				description:
					'Read branch protection from push.remote, the branch upstream remote, or origin, then refresh the effective commit-policy protected branch list. Local push.protectedBranches always remains protected, even when the remote is unsupported or refresh fails.',
				inputSchema: z.object({}),
				outputSchema: OutputSchema,
			},
			async () => runBranchProtectionRefresh(options.adapter),
		);
	},
});
