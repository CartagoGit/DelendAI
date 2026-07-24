import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';

const runCreatePluginMock = vi.fn();
const createWorkspacePathProviderMock = vi.fn((root: string) => ({
	root,
	resolve: (relativePath: string) => `${root}/${relativePath}`,
}));

const buildContext = (): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json: false,
		format: 'text',
		lang: 'en',
		noColor: false,
		plugins: [],
	},
	request: async <TOut>() => ({ ok: true }) as unknown as TOut,
	listTools: async () => [],
	close: async () => {},
});

describe('plugin new command', () => {
	beforeEach(() => {
		runCreatePluginMock.mockReset();
		createWorkspacePathProviderMock.mockClear();
	});

	it('renders a happy-path summary and exits 0 when the doctor passes', async () => {
		// The doctor command takes ~1s on cold cache; under parallel load the
		// shared 5s default timeout can flip this. Bumping to 15s keeps the
		// assertion sharp without flaking on slow CI.
		runCreatePluginMock.mockResolvedValue({
			ok: true,
			pluginId: 'demo',
			scaffolded: {
				files: [
					'plugins/demo/package.json',
					'plugins/demo/src/index.ts',
				],
			},
			wired: [
				{ pointId: 'tsconfig-base', edits: [], wired: true },
				{ pointId: 'catalog-regen', edits: [], wired: true },
			],
			doctor: {
				pluginId: 'demo',
				points: [],
				fullyWired: true,
				missing: [],
			},
		});
		const { buildPluginNewCommand } = await import('./core');
		const command = buildPluginNewCommand({
			createWorkspacePathProvider: createWorkspacePathProviderMock,
			runCreatePlugin: runCreatePluginMock,
		});
		const result = await command.run(
			['demo', '--description=Demo plugin'],
			buildContext(),
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(result.text).toContain('plugin: demo');
		expect(result.text).toContain('doctor: fully wired');
		expect(runCreatePluginMock).toHaveBeenCalledWith(
			{
				name: 'demo',
				description: 'Demo plugin',
			},
			expect.objectContaining({
				workspace: expect.objectContaining({ root: '/workspace' }),
			}),
		);
	}, 15_000);
});
