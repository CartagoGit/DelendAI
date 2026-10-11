import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';
import type { IToolRegistration } from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';

const callTool = async (tool: IToolRegistration, args: unknown) => {
	let handler!: (input: unknown) => Promise<{
		content: Array<{ text?: string }>;
	}>;
	await tool.register({
		registerTool: (
			_name: string,
			_description: unknown,
			next: typeof handler,
		) => {
			handler = next;
		},
	} as never);
	return JSON.parse((await handler(args)).content[0]?.text ?? '{}');
};

describe('managed lazy assembly defaults', () => {
	const workspaces: string[] = [];

	afterEach(() => {
		for (const workspace of workspaces.splice(0)) {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it('uses lazy module loading when managedSurface.loading is omitted', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'delendai-lazy-'));
		workspaces.push(workspace);
		const args = parseCliArgs(
			[`--plugins=memory`, `--workspace=${workspace}`],
			workspace,
		);
		const assembled = await assembleCliConfig(args, {
			readFile: async () => undefined,
			import: async () => ({
				default: {
					name: 'memory',
					register: () => ({ tools: [] }),
				},
			}),
		});

		expect(assembled.loadResult.loaded).toEqual([]);
		expect(assembled.startupReport.runtime.moduleLoading).toBe('lazy');
		expect(
			assembled.config.lazyToolActivators?.has('delendai_memory_save'),
		).toBe(true);
		const descriptor = assembled.config.toolSurfacePlan?.descriptors.find(
			(entry) => entry.registrationId === 'delendai_memory_save',
		);
		expect(descriptor?.summary).toBeTruthy();
		expect(descriptor?.tags).toContain('lazy');
		const configurationTool = assembled.config.extraTools?.find(
			(tool) => tool.id === 'configuration_center',
		);
		const page = await callTool(configurationTool!, {
			section: 'plugins',
			limit: 100,
		});
		expect(
			page.plugins.find(
				(plugin: { id: string }) => plugin.id === 'memory',
			).permissions,
		).toEqual(['filesystem-read', 'filesystem-write']);
	});

	it('keeps explicit native surface on the eager compatibility path', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'delendai-native-'));
		workspaces.push(workspace);
		const args = parseCliArgs(
			[
				`--surface=native`,
				`--plugins=memory`,
				`--workspace=${workspace}`,
			],
			workspace,
		);
		const assembled = await assembleCliConfig(args, {
			readFile: async (absolutePath) =>
				absolutePath.endsWith('delendai.config.json')
					? JSON.stringify({ managedSurface: { loading: 'lazy' } })
					: undefined,
			import: async () => ({
				default: {
					name: 'memory',
					register: () => ({ tools: [] }),
				},
			}),
		});

		expect(assembled.startupReport.runtime.moduleLoading).toBe('eager');
		expect(assembled.config.lazyToolActivators).toBeUndefined();
		expect(assembled.loadResult.loaded).toHaveLength(1);
	});

	it('activates configured automatic plugins before the first tool call', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'delendai-startup-'));
		workspaces.push(workspace);
		let registered = 0;
		const args = parseCliArgs(
			[`--plugins=commit-policy`, `--workspace=${workspace}`],
			workspace,
		);
		const assembled = await assembleCliConfig(args, {
			readFile: async (absolutePath) =>
				absolutePath.endsWith('delendai.config.json')
					? JSON.stringify({
							plugins: {
								'commit-policy': {
									options: {
										commit: { enabled: true },
										push: { enabled: true },
										cadence: {
											triggers: [{ kind: 'slice' }],
										},
									},
								},
							},
						})
					: undefined,
			import: async () => ({
				default: {
					name: 'commit-policy',
					register: () => {
						registered += 1;
						return { tools: [] };
					},
				},
			}),
		});

		expect(registered).toBe(1);
		expect(assembled.loadResult.loaded).toEqual([]);
		expect(assembled.startupReport.runtime.moduleLoading).toBe('lazy');
		const activator =
			assembled.config.lazyPluginActivators?.get('commit-policy');
		expect(activator).toBeDefined();
		await activator?.();
		expect(registered).toBe(1);
	});

	it('activates startup plugins without explicit options', async () => {
		const workspace = mkdtempSync(
			join(tmpdir(), 'delendai-startup-manifest-'),
		);
		workspaces.push(workspace);
		let registered = 0;
		const args = parseCliArgs(
			[`--plugins=error-reporting`, `--workspace=${workspace}`],
			workspace,
		);
		const assembled = await assembleCliConfig(args, {
			readFile: async () => undefined,
			import: async () => ({
				default: {
					name: 'error-reporting',
					startupActivation: true,
					register: () => {
						registered += 1;
						return { tools: [] };
					},
				},
			}),
		});

		expect(registered).toBe(1);
		expect(assembled.loadResult.loaded).toEqual([]);
	});
});
