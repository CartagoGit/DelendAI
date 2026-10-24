import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IMcpPluginContext } from '@delendai/core/contracts';
import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import plugin from './index';

type IHandler = (
	args: unknown,
) => Promise<{ content: Array<{ text: string }> }>;

describe('the container plugin', () => {
	it('offers the docker tools everywhere, and refuses their changes in a repository without Docker', async () => {
		const root = mkdtempSync(join(tmpdir(), 'container-plugin-'));
		try {
			const registrations = await plugin.register(
				fakePartial<IMcpPluginContext>({
					namespacePrefix: 'c',
					options: {},
					workspace: fakePartial<IMcpPluginContext['workspace']>({
						root,
						resolve: (path: string) => join(root, path),
					}),
				}),
			);
			const tools: Record<string, IHandler> = {};
			const server = createFakeToolServer({
				onRegisterTool: ({ name, handler }) => {
					tools[name] = handler as IHandler;
				},
			});
			for (const tool of ('tools' in registrations
				? registrations.tools
				: undefined) ?? [])
				await tool.register(server);
			expect(Object.keys(tools)).toContain('c_container_run');
			const run = tools.c_container_run;
			if (run === undefined)
				throw new Error('container_run was not registered');
			const answer = JSON.parse(
				(await run({ image: 'alpine', confirm: true })).content[0]
					?.text ?? '{}',
			);
			expect(String(answer.reason)).toContain('no sign of using Docker');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
