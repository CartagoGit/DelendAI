/**
 * agent-worktree.tool.spec.ts — f00052 S7
 *
 * Unit-level proof of the host-scoped gate. Drives
 * `buildAgentWorktreeRegistration`'s handler directly with a fake
 * `IGitRunner` so we can assert that, when the capability is disabled,
 * the engine is NEVER invoked (the runner records zero calls) and the
 * tool returns the documented structured `ok: false` error. When the
 * capability is enabled, the same handler does reach the runner.
 */
import { describe, expect, it } from 'vitest';

import {
	AGENT_WORKTREE_DISABLED_REASON,
	buildAgentWorktreeRegistration,
} from '@mcp-vertex/proposals/lib/tools/agent-worktree.tool';
import type {
	IGitRunner,
	IGitRunResult,
} from '@mcp-vertex/proposals/lib/shared/git-runner';

interface IHandlerResult {
	readonly structuredContent?: Record<string, unknown>;
	readonly isError?: boolean;
	readonly content?: ReadonlyArray<{ type: string; text?: string }>;
}

type ToolHandler = (args: {
	action: 'create' | 'list' | 'remove';
	agent?: string;
}) => Promise<IHandlerResult>;

/** Capture the handler the registration installs on the MCP server. */
const captureHandler = async (
	enabled: boolean,
	run: IGitRunner,
	worktreesDirRel?: string,
): Promise<ToolHandler> => {
	const registration = buildAgentWorktreeRegistration({
		namespacePrefix: 'proposals',
		workspaceRoot: '/ws',
		run,
		enabled,
		...(worktreesDirRel !== undefined ? { worktreesDirRel } : {}),
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

describe('buildAgentWorktreeRegistration — host gate (f00052 S7)', async () => {
	it('returns the documented error and never invokes the engine when disabled', async () => {
		let calls = 0;
		const run: IGitRunner = async (): Promise<IGitRunResult> => {
			calls += 1;
			return { ok: true, output: '' };
		};
		const handler = await captureHandler(false, run);

		const result = await handler({ action: 'create', agent: 'agent-A' });

		expect(calls).toBe(0); // engine (git) was never reached
		expect(result.isError).toBe(true);
		expect(result.structuredContent?.ok).toBe(false);
		expect(result.structuredContent?.action).toBe('create');
		expect(result.structuredContent?.reason).toBe(
			AGENT_WORKTREE_DISABLED_REASON,
		);
		// The content text mirrors the structured payload (parity invariant).
		const text = result.content?.[0]?.text ?? '{}';
		expect(JSON.parse(text)).toEqual(result.structuredContent);
	});

	it('echoes the requested action in the disabled error', async () => {
		const run: IGitRunner = async () => ({ ok: true, output: '' });
		const handler = await captureHandler(false, run);
		const result = await handler({ action: 'list' });
		expect(result.structuredContent?.action).toBe('list');
	});

	it('invokes the engine when the capability is enabled', async () => {
		let calls = 0;
		const run: IGitRunner = async (): Promise<IGitRunResult> => {
			calls += 1;
			// `list` only needs `git worktree list --porcelain`; an empty
			// output is a valid "no worktrees" answer.
			return { ok: true, output: '' };
		};
		const handler = await captureHandler(true, run);

		const result = await handler({ action: 'list' });

		expect(calls).toBeGreaterThan(0); // engine was reached
		expect(result.structuredContent?.reason).not.toBe(
			AGENT_WORKTREE_DISABLED_REASON,
		);
	});

	it('passes the configured worktree directory to the engine', async () => {
		const calls: string[][] = [];
		const run: IGitRunner = async (args): Promise<IGitRunResult> => {
			calls.push([...args]);
			if (args[0] === 'worktree' && args[1] === 'list') {
				return { ok: true, output: '' };
			}
			if (args[0] === 'rev-parse') {
				return { ok: false, output: '', reason: 'not found' };
			}
			return { ok: true, output: '' };
		};
		const handler = await captureHandler(
			true,
			run,
			'.cache/mcp-vertex/.worktrees',
		);

		const result = await handler({ action: 'create', agent: 'agent-A' });

		expect(result.structuredContent?.path).toBe(
			'/ws/.cache/mcp-vertex/.worktrees/agent-a',
		);
		expect(
			calls.find((c) => c[0] === 'worktree' && c[1] === 'add'),
		).toEqual([
			'worktree',
			'add',
			'-b',
			'agent/agent-a',
			'/ws/.cache/mcp-vertex/.worktrees/agent-a',
			'HEAD',
		]);
	});
});
