/**
 * assemble.eviction.spec.ts — f00068 slice A.
 *
 * Integration test: `assembleCliConfig` must
 *   1. Build a fresh `ICacheEvictionRegistry` per boot.
 *   2. Project that registry onto every plugin via
 *      `IMcpPluginContext.cacheEvictionRegistry`.
 *   3. Run a dryRun sweep AFTER every plugin has registered, and
 *      surface the report in `IAssembledCliConfig.cacheEvictionBootReport`.
 *
 * The plugin records the context it received and the rules it
 * registered so the test can assert the wiring end-to-end.
 */
import {
	mkdtemp,
	mkdir,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@mcp-vertex/core/lib/cli/assemble';
import type {
	ICacheEvictionRegistry,
	IMcpPluginContext,
} from '@mcp-vertex/core/public';
import { parseCliArgs } from '@mcp-vertex/core/lib/plugins/parse-cli-args';

interface IPluginSink {
	ctx?: IMcpPluginContext;
	registry?: ICacheEvictionRegistry | undefined;
}

const capturingImport = (sink: IPluginSink) =>
	async (_specifier: string): Promise<{ default: unknown }> => ({
		default: {
			name: 'capture',
			register: (ctx: IMcpPluginContext) => {
				sink.ctx = ctx;
				const registry = ctx.cacheEvictionRegistry;
				sink.registry = registry;
				// Register a rule whose target lives in the test's
				// temp cacheDir; the boot sweep should pick it up.
				if (registry !== undefined) {
					registry.register({
						id: 'capture-old',
						owner: 'capture',
						path: 'capture/*',
						when: { kind: 'olderThanDays', days: 7 },
					});
				}
				return {};
			},
		},
	});

const baseArgs = (workspace: string, extra: readonly string[] = []) =>
	parseCliArgs(['--workspace', workspace, '--plugins=capture', ...extra], workspace);

const fileReader = (file: string | undefined) =>
	async (_path: string): Promise<string | undefined> => file;

describe('assembleCliConfig — cache eviction boot wiring (f00068 A)', () => {
	let workspace: string;
	let cacheDir: string;

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), 'evict-boot-'));
		cacheDir = join(workspace, '.cache/mcp-vertex');
		await mkdir(cacheDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(workspace, { recursive: true, force: true });
	});

	it('hands the registry to every plugin and runs a boot sweep', async () => {
		// Plant a file the rule will flag. The rule's path is
		// `capture/*` so the file lives at `<cacheDir>/capture/`.
		await mkdir(join(cacheDir, 'capture'), { recursive: true });
		await writeFile(
			join(cacheDir, 'capture', '2026-06-01.jsonl'),
			'old\n',
		);

		const sink: IPluginSink = {};
		const assembled = await assembleCliConfig(baseArgs(workspace), {
			readFile: fileReader(undefined),
			import: capturingImport(sink),
		});

		// 1. Same registry instance is shared with the plugin.
		expect(sink.registry).toBeDefined();
		expect(assembled.cacheEvictionRegistry).toBe(sink.registry);

		// 2. Boot sweep ran and reported the rule's would-be removal.
		expect(assembled.cacheEvictionBootReport.dryRun).toBe(true);
		expect(assembled.cacheEvictionBootReport.rulesEvaluated).toBe(1);
		expect(assembled.cacheEvictionBootReport.removed).toHaveLength(1);
		expect(assembled.cacheEvictionBootReport.removed[0]?.path).toBe(
			'capture/2026-06-01.jsonl',
		);

		// 3. Boot sweep was a dry-run, so the file is still on disk.
		const info = await stat(join(cacheDir, 'capture', '2026-06-01.jsonl'));
		expect(info.isFile()).toBe(true);
	});

	it('does NOT run the boot sweep if the registry has no rules', async () => {
		const silentImport = async (
			_specifier: string,
		): Promise<{ default: unknown }> => ({
			default: {
				name: 'silent',
				register: () => ({}),
			},
		});
		const assembled = await assembleCliConfig(baseArgs(workspace), {
			readFile: fileReader(undefined),
			import: silentImport,
		});
		expect(assembled.cacheEvictionBootReport.removed).toHaveLength(0);
		expect(assembled.cacheEvictionBootReport.rulesEvaluated).toBe(0);
	});

	it('rejects a cacheDir that escapes the workspace', async () => {
		const badArgs = parseCliArgs(
			[
				'--workspace',
				workspace,
				'--plugins=capture',
				'--cacheDir=../outside',
			],
			workspace,
		);
		await expect(
			assembleCliConfig(badArgs, {
				readFile: fileReader(undefined),
				import: capturingImport({}),
			}),
		).rejects.toThrow(/cacheDir escapes workspace/);
	});
});