/**
 * delegation-wiring.spec.ts — a real dispatch through the plugin goes
 * with a manifest of the task's files and the change context around
 * them, and hands back a receipt and a reference, not the transcript.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { createFakeToolServer } from '@delendai/test-kit/public';
import { afterEach, describe, expect, it } from 'vitest';

import plugin from '../../src/index';
import {
	DEFAULT_BUDGET_POLICY,
	DEFAULT_ROTATION_POLICY,
} from '../../src/lib/policy/types';

type Context = Parameters<typeof plugin.register>[0];

describe('the dispatch, wired', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('delegates with a manifest and returns a reference to a long output', async () => {
		const root = mkdtempSync(join(tmpdir(), 'delegation-wiring-'));
		dirs.push(root);
		mkdirSync(join(root, 'src'));
		writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
		const requests: unknown[] = [];
		const served = await plugin.register(
			fakePartial<Context>({
				namespacePrefix: 'x',
				options: {
					policy: {
						defaultMode: 'linear',
						defaults: {
							budget: DEFAULT_BUDGET_POLICY,
							rotation: DEFAULT_ROTATION_POLICY,
						},
					},
				},
				pluginCacheDir: '.cache/delendai/agent-orchestrator',
				cacheDir: '.cache/delendai',
				docsDir: 'docs',
				workspace: fakePartial<Context['workspace']>({
					root,
					resolve: (path: string) => join(root, path),
				}),
				peerPlugins: {
					list: () => ['context-for-change'],
					has: (name: string) => name === 'context-for-change',
				},
				pluginOptions: new Map([
					['context-for-change', { maxBytes: 4000 }],
				]),
				subagentRuntime: {
					hostId: 'spec-host',
					spawnSubagent: async (request) => {
						requests.push(request);
						return {
							subagentId: `s${String(requests.length)}`,
							tokensUsed: 10,
							output: 'done '.repeat(100),
							schemaOk: true,
							hadError: false,
							receipt: {
								status: 'done',
								filesChanged: ['src/a.ts'],
								checks: [],
								exceptions: [],
							},
						};
					},
				},
			}),
		);
		const tools =
			'registrations' in served
				? served.registrations.tools
				: served.tools;
		const handlers: Record<string, (args: unknown) => Promise<unknown>> =
			{};
		for (const tool of tools ?? []) {
			await tool.register(
				createFakeToolServer({
					onRegisterTool: ({ name, handler }) => {
						handlers[name] = handler as (
							args: unknown,
						) => Promise<unknown>;
					},
				}),
			);
		}
		const answer = JSON.stringify(
			await handlers.x_dispatch?.({
				task: {
					id: 't1',
					description: 'rename a to b',
					files: ['src/a.ts'],
					tags: [],
				},
			}),
		);
		expect(requests.length).toBeGreaterThan(0);
		expect(requests[0]).toHaveProperty('task.manifestId');
		expect(requests[0]).toMatchObject({
			metadata: { delegation: 'manifest', delegationPath: 'prompt' },
		});
		expect(answer).toContain('outputRef');
		expect(answer).toContain('done · files: src/a.ts');
	});
});
