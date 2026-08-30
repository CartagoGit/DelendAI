import { describe, expect, it, vi } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';

const authorExternalPluginMock = vi.fn();
vi.mock('@mcp-vertex/core/public', async () => ({
	authorExternalPlugin: authorExternalPluginMock,
	createWorkspacePathProvider: (root: string) => ({
		root,
		resolve: (path: string) => `${root}/${path}`,
	}),
}));

const context = (json: boolean): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json,
		format: json ? 'json' : 'text',
		lang: 'en',
		noColor: false,
		plugins: [],
	},
	request: async <T>() => ({}) as T,
	listTools: async () => [],
	close: async () => {},
});

describe('plugin author command', () => {
	it('invokes the shared core authoring capability and supports JSON', async () => {
		authorExternalPluginMock.mockResolvedValue({
			ok: true,
			name: 'demo',
			nextSteps: 'restart',
			files: { planned: [], written: [], preserved: [], moved: [] },
			registration: { action: 'added', configFile: 'x', path: 'y' },
		});
		const { pluginAuthorCommand } = await import('./plugin-author');
		const result = await pluginAuthorCommand.run(
			['demo', '--dry-run'],
			context(true),
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.data).toMatchObject({ name: 'demo' });
		expect(authorExternalPluginMock).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'demo', dryRun: true }),
			expect.objectContaining({
				workspace: expect.objectContaining({ root: '/workspace' }),
			}),
		);
	});
});
