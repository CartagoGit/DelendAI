/**
 * branch-status.tool.spec.ts
 *
 * Regression guard for the FASE-0 worktree-path-coherence bug. The
 * `agent_worktree` engine creates worktrees under
 * `<root>/<layout.worktreesDir>/<slug>` (default
 * `.cache/mcp-vertex/.worktrees/<slug>`). The `branch_status` tool must
 * treat that SAME directory as the canonical worktrees root, otherwise it
 * flags every correctly-placed worktree as `outOfCache: true`.
 *
 * The historical wiring double-prefixed the path
 * (`.cache/mcp-vertex/${layout.worktreesDir}` →
 * `.cache/mcp-vertex/.cache/mcp-vertex/.worktrees`), which can never match
 * a real worktree path. This spec drives the registration's handler with a
 * fake git runner that reports a worktree at the canonical location and
 * asserts it is NOT flagged out-of-cache when the tool is wired with
 * `canonicalWorktreesDirRel = layout.worktreesDir`.
 */
import { describe, expect, it } from 'vitest';

import { buildBranchStatusRegistration } from '@mcp-vertex/proposals/lib/tools/branch-status.tool';
import { buildSwarmPaths } from '@mcp-vertex/proposals/lib/contracts/constants/default-path-layout.constant';
import type {
	IGitRunner,
	IGitRunResult,
} from '@mcp-vertex/proposals/lib/shared/git-runner';

interface IHandlerResult {
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
}

type ToolHandler = (args: {
	baseBranch?: string;
	agentPrefix?: string;
}) => Promise<IHandlerResult>;

const captureHandler = async (
	run: IGitRunner,
	canonicalWorktreesDirRel: string,
): Promise<ToolHandler> => {
	const registration = buildBranchStatusRegistration({
		namespacePrefix: 'proposals',
		workspaceRoot: '/ws',
		run,
		defaultBaseBranch: 'develop',
		defaultAgentPrefix: 'agent/',
		canonicalWorktreesDirRel,
	});
	let handler: ToolHandler | undefined;
	const fakeServer = {
		registerTool: (_name: string, _schema: unknown, h: ToolHandler) => {
			handler = h;
		},
	} as unknown as Parameters<typeof registration.register>[0];
	await registration.register(fakeServer);
	if (handler === undefined) throw new Error('handler was not registered');
	return handler;
};

const okEmpty: IGitRunResult = { ok: true, output: '' };

/**
 * A worktree placed exactly where `agent_worktree` would create it:
 * `<root>/<layout.worktreesDir>/orion`.
 */
const makeRunner = (worktreeAbsPath: string): IGitRunner => {
	return async (args): Promise<IGitRunResult> => {
		if (args[0] === 'branch' && args[1] === '--list') {
			return { ok: true, output: '  agent/orion\n' };
		}
		if (args[0] === 'worktree' && args[1] === 'list') {
			return {
				ok: true,
				output: [
					`worktree ${worktreeAbsPath}`,
					'HEAD def5678',
					'branch refs/heads/agent/orion',
				].join('\n'),
			};
		}
		return okEmpty;
	};
};

describe('buildBranchStatusRegistration — canonical worktrees dir coherence', async () => {
	it('does NOT flag a worktree at layout.worktreesDir as outOfCache', async () => {
		const layout = buildSwarmPaths('.cache/mcp-vertex', 'docs/mcp-vertex');
		// What the agent_worktree engine actually creates:
		// join(root, layout.worktreesDir, slug).
		const worktreeAbsPath = `/ws/${layout.worktreesDir}/orion`;
		const handler = await captureHandler(
			makeRunner(worktreeAbsPath),
			// FASE 0 fix: the tool is wired with the same relative dir the
			// engine resolves — NOT `.cache/mcp-vertex/${layout.worktreesDir}`.
			layout.worktreesDir,
		);

		const result = await handler({});

		expect(result.structuredContent?.ok).toBe(true);
		const worktrees = result.structuredContent?.worktrees as Array<{
			path: string;
			outOfCache: boolean;
		}>;
		expect(worktrees).toHaveLength(1);
		expect(worktrees[0]?.path).toBe(worktreeAbsPath);
		expect(worktrees[0]?.outOfCache).toBe(false);
		const summary = result.structuredContent?.summary as {
			outOfCacheWorktrees: number;
		};
		expect(summary.outOfCacheWorktrees).toBe(0);
	});

	it('still flags a worktree outside the canonical dir as outOfCache', async () => {
		const layout = buildSwarmPaths('.cache/mcp-vertex', 'docs/mcp-vertex');
		// A worktree at the repo-root `.worktrees/` (the orphan-dir failure
		// mode) is correctly outside the canonical cache dir.
		const handler = await captureHandler(
			makeRunner('/ws/.worktrees/orion'),
			layout.worktreesDir,
		);

		const result = await handler({});

		const worktrees = result.structuredContent?.worktrees as Array<{
			outOfCache: boolean;
		}>;
		expect(worktrees[0]?.outOfCache).toBe(true);
	});
});
