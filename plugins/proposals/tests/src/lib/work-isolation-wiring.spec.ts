/**
 * work-isolation-wiring.spec.ts — under a shared-checkout profile, the
 * real plugin never sends an agent to a worktree.
 *
 * Reproduces what an adopter project on `shared-checkout-merge` saw:
 * the workflow told 2+ agents to call agent_worktree, the call was refused
 * with "set agentWorktree: true to enable", and the agent created
 * worktrees and `agent/*` branches by hand. Driven through `register()`
 * with the resolved policy, as a host delivers it.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/public';
import { resolveDevelopmentPolicy } from '@delendai/core/public';
import plugin from '@delendai/proposals';
import { createFakeToolServer } from '@delendai/test-kit/public';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const contextFor = (profile: string): IMcpPluginContext => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-isolation-'));
	roots.push(root);
	mkdirSync(join(root, 'docs/delendai/proposals/ready'), { recursive: true });
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	return {
		workspace: { root, resolve: (p: string) => join(root, p) },
		corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
		cacheDir: '.cache/delendai',
		docsDir: 'docs/delendai',
		keepLegacy: false,
		pluginCacheDir: '.cache/delendai/proposals',
		pluginDocsDir: 'docs/delendai/proposals',
		namespacePrefix: 'proposals',
		options: {},
		args: {},
		agentWorktreeEnabled: false,
		developmentPolicy: resolveDevelopmentPolicy({
			development: { profile },
		}),
	};
};

/** Call a registered tool's handler the way a host does. */
const callTool = async (
	ctx: IMcpPluginContext,
	id: string,
	args: unknown,
): Promise<{ structuredContent?: Record<string, unknown> }> => {
	const registrations = await plugin.register(ctx);
	const registration = (registrations.tools ?? []).find(
		(tool) => tool.id === id,
	);
	if (registration === undefined) throw new Error(`${id} not registered`);
	let handler:
		| ((
				a: unknown,
		  ) => Promise<{ structuredContent?: Record<string, unknown> }>)
		| undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as typeof handler;
			},
		}),
	);
	if (handler === undefined) throw new Error(`${id} has no handler`);
	return handler(args);
};

describe('proposals under shared-checkout-merge', () => {
	it('describes the shared checkout in its workflow rules', async () => {
		const result = await callTool(
			contextFor('shared-checkout-merge'),
			'get_proposal_workflow',
			{},
		);
		const rules = (result.structuredContent?.rules ?? []) as string[];
		expect(
			rules.some((rule) => rule.includes('must call agent_worktree')),
		).toBe(false);
		expect(
			rules.some((rule) =>
				rule.includes('`shared-checkout-merge` development profile'),
			),
		).toBe(true);
	});

	it('refuses agent_worktree by explaining how to work, not how to enable it', async () => {
		const result = await callTool(
			contextFor('shared-checkout-merge'),
			'agent_worktree',
			{ action: 'create', agent: 'screens-implementation-runner' },
		);
		const reason = String(result.structuredContent?.reason ?? '');
		expect(reason).toContain('not used under the `shared-checkout-merge`');
		expect(reason).toContain('Do not create worktrees or branches');
		expect(reason).not.toContain('agentWorktree: true');
	});
});
