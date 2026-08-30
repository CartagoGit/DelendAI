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
	provider: z.enum(['github', 'gitlab']).optional(),
	remoteBranches: z.array(z.string()).optional(),
	effectiveBranches: z.array(z.string()).optional(),
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
				provider: result.provider,
				remoteBranches: [...result.remoteBranches],
				effectiveBranches: [...result.effectiveBranches],
			}
		: {
				ok: false,
				...(result.provider !== undefined
					? { provider: result.provider }
					: {}),
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
	if (!result.ok) {
		return toolError(
			result.reason,
			'Check the origin remote and the authenticated gh/glab CLI, then retry the refresh.',
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
					'Read the origin forge protection rules and refresh the effective commit-policy protected branch list. Local push.protectedBranches remains protected; use this when the repository or forge rules change.',
				inputSchema: z.object({}),
				outputSchema: OutputSchema,
			},
			async () => runBranchProtectionRefresh(options.adapter),
		);
	},
});
