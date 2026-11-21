/**
 * run-cli.spec.ts: the helpers of the `delendai` bin entry. Merges the
 * former verbose.spec.ts and blueprint-cachedir.spec.ts (the blueprint
 * must land under the resolved cacheDir, M15/H5) with the startup
 * preset migration, which must run with or without an explicit --config.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import {
	buildAssemblyDiagnostics,
	formatVerbose,
	migratePresetOnStart,
	prepareServerBlueprintOnStart,
	runCli,
	runDoctor,
} from '@delendai/core/lib/cli/run-cli';
import type { IDelendaiHostConfig } from '@delendai/core/lib/contracts/interfaces/host-config.interface';
import type { IDelendaiProjectMetadata } from '@delendai/core/lib/contracts/interfaces/project-metadata.interface';
import type {
	IPromptRegistration,
	IToolRegistration,
} from '@delendai/core/lib/contracts/interfaces/tool-registration.interface';
import type { IMcpPlugin } from '@delendai/core/lib/plugins/plugin-contract';
import type {
	ILoadedPlugin,
	IPluginLoadResult,
} from '@delendai/core/lib/plugins/load-plugins';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	shutdown: vi.fn(),
	runInit: vi.fn(),
}));
vi.mock('@delendai/core/lib/project/create-mcp-project', () => ({
	createMcpProject: mocks.create,
}));
vi.mock('@delendai/core/lib/cli/graceful-shutdown', () => ({
	gracefulShutdown: mocks.shutdown,
}));
vi.mock('@delendai/core/lib/cli/run-init', () => ({
	runInit: mocks.runInit,
}));

const WRITABLE_WORKSPACE = createTestWorkspace('delendai-run-cli-');
afterAll(() => removeTestWorkspace(WRITABLE_WORKSPACE));

const verboseArgs = parseCliArgs(
	[
		'--plugins=demo,other',
		'--workspace=/ws',
		'--cacheDir=.c',
		'--docsDir=.d',
	],
	'/cwd',
);

const loadResult = fakePartial<IPluginLoadResult>({
	loaded: [
		fakePartial<ILoadedPlugin>({
			plugin: fakePartial<IMcpPlugin>({ name: 'demo', version: '1.2.3' }),
			registrations: {},
		}),
		fakePartial<ILoadedPlugin>({
			plugin: fakePartial<IMcpPlugin>({ name: 'other' }),
			registrations: {},
		}),
	],
	errors: [{ specifier: 'broken', message: 'boom' }],
});

const config = fakePartial<IDelendaiHostConfig>({
	metadata: fakePartial<IDelendaiProjectMetadata>({
		name: 's',
		version: '0',
	}),
	namespacePrefix: 'delendai',
	extraTools: ['a', 'b', 'c'].map((id) =>
		fakePartial<IToolRegistration>({ id }),
	),
	extraPrompts: [fakePartial<IPromptRegistration>({ id: 'p' })],
	extraResources: [],
});

describe('--verbose diagnostics (N23)', async () => {
	it('[<50ms] buildAssemblyDiagnostics snapshots plugins, counts and order', async () => {
		const d = buildAssemblyDiagnostics(verboseArgs, loadResult, config, [
			'delendai_overview',
			'demo_x',
		]);
		expect(d.workspace).toBe('/ws');
		expect(d.cacheDir).toBe('.c');
		expect(d.plugins.requested).toEqual(['demo', 'other']);
		expect(d.plugins.loaded).toEqual([
			{ name: 'demo', version: '1.2.3' },
			{ name: 'other' },
		]);
		expect(d.plugins.errors).toEqual(['boom']);
		expect(d.counts).toEqual({ tools: 3, prompts: 1, resources: 0 });
		expect(d.registrationOrder).toEqual(['delendai_overview', 'demo_x']);
	});

	it('[<50ms] formatVerbose renders stderr lines with version + counts + order', async () => {
		const out = formatVerbose(
			buildAssemblyDiagnostics(verboseArgs, loadResult, config, ['t1']),
		);
		expect(out).toContain('[delendai] verbose:');
		expect(out).toContain('loaded=[demo@1.2.3, other]');
		expect(out).toContain('errors=1');
		expect(out).toContain('tools=3 prompts=1 resources=0');
		expect(out).toContain('registrationOrder=[t1]');
		expect(out.endsWith('\n')).toBe(true);
	});
});

describe('prepareServerBlueprintOnStart cacheDir (M15/H5)', async () => {
	let ws = '';
	beforeEach(() => {
		ws = mkdtempSync(join(tmpdir(), 'bp-cache-'));
	});
	afterEach(() => rmSync(ws, { recursive: true, force: true }));

	it('[<100ms] writes under the resolved cacheDir (e.g. from config), not the default', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args, 'build/state');
		expect(res.written).toBe(true);
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
	});

	it('[<100ms] falls back to the default cacheDir when none is resolved', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args);
		expect(res.path).toBe('.cache/delendai/bootstrap/blueprint.json');
	});

	it('[<100ms] collapses trailing slashes in the resolved cacheDir path', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const res = await prepareServerBlueprintOnStart(args, 'build/state///');
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
	});

	it('[<100ms] handles a long trailing slash run in cacheDir quickly', async () => {
		const args = parseCliArgs([`--workspace=${ws}`], ws);
		const started = Date.now();
		const res = await prepareServerBlueprintOnStart(
			args,
			`build/state${'/'.repeat(40_000)}`,
		);
		expect(res.path).toBe('build/state/bootstrap/blueprint.json');
		expect(Date.now() - started).toBeLessThan(1_000);
	});
});

describe('migratePresetOnStart', () => {
	const roots: string[] = [];
	const workspace = async (): Promise<string> => {
		const root = await mkdtemp(join(tmpdir(), 'preset-on-start-'));
		roots.push(root);
		return root;
	};
	afterEach(async () => {
		await Promise.all(
			roots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	const lean = JSON.stringify({
		plugins: { docs: {}, git: {}, memory: {}, search: {} },
	});

	it('[<50ms] runs with an explicit relative --config, the way consumers launch it', async () => {
		const root = await workspace();
		await writeFile(join(root, 'custom.config.json'), lean);
		const result = await migratePresetOnStart({
			workspace: root,
			configPath: 'custom.config.json',
		});
		expect(result.outcome).toBe('recorded');
		const journal = await readFile(
			join(root, '.cache/delendai/preset-migration.jsonl'),
			'utf8',
		);
		expect(JSON.parse(journal.trim())).toMatchObject({ retired: 'lean' });
		expect(await readFile(join(root, 'custom.config.json'), 'utf8')).toBe(
			lean,
		);
	});

	it('[<50ms] runs with an absolute --config and with the default config', async () => {
		const root = await workspace();
		await writeFile(join(root, 'delendai.config.json'), lean);
		expect((await migratePresetOnStart({ workspace: root })).outcome).toBe(
			'recorded',
		);
		const other = await workspace();
		const path = join(other, 'abs.json');
		await writeFile(path, lean);
		expect(
			(await migratePresetOnStart({ workspace: other, configPath: path }))
				.outcome,
		).toBe('recorded');
	});

	it('[<50ms] does nothing without a config', async () => {
		expect(
			(await migratePresetOnStart({ workspace: await workspace() }))
				.outcome,
		).toBe('unchanged');
	});
});

describe('runDoctor', async () => {
	const demoPlugin = { name: 'demo', register: () => ({}) };
	it('[<500ms] reports loaded plugins, errors and counts without starting stdio', async () => {
		const args = parseCliArgs(
			[
				'--plugins=demo,nope',
				`--workspace=${WRITABLE_WORKSPACE}`,
				'--surface=native',
			],
			WRITABLE_WORKSPACE,
		);
		const report = await runDoctor(args, {
			import: async (specifier: string) => {
				if (specifier.includes('demo')) return { default: demoPlugin };
				throw new Error('not found');
			},
			readFile: async () => undefined,
		});
		expect(report.plugins.loaded).toEqual(['demo']);
		expect(report.plugins.errors.length).toBe(1);
		expect(report.ok).toBe(false);
		expect(report.counts.tools).toBeGreaterThan(0);
	});

	it("[<500ms] names each account's layer, and reports a personal file it could not take", async () => {
		const args = parseCliArgs(
			[`--workspace=${WRITABLE_WORKSPACE}`, '--surface=native'],
			WRITABLE_WORKSPACE,
		);
		const account = (accountId: string) => ({
			accountId,
			vendor: 'anthropic',
			credentialMode: 'official-subscription-login',
			billingMode: 'subscription-included',
		});
		const reportWith = (personal: string) =>
			runDoctor(args, {
				personalConfigRoot: '/personal-root',
				readFile: async (path: string) =>
					path.startsWith('/personal-root/delendai/projects/')
						? personal
						: path.endsWith('delendai.config.json')
							? JSON.stringify({
									accounts: [
										account('team'),
										account('shared-only'),
									],
								})
							: undefined,
			});
		const report = await reportWith(
			JSON.stringify({ accounts: [account('team'), account('mine')] }),
		);
		expect(report.accounts.personalLayer).toMatch(
			/^\/personal-root\/delendai\/projects\/[0-9a-f]{16}\.json$/u,
		);
		expect(report.accounts.layers).toEqual([
			{ accountId: 'team', layer: 'personal' },
			{ accountId: 'shared-only', layer: 'shared' },
			{ accountId: 'mine', layer: 'personal' },
		]);
		const broken = await reportWith('{ nope');
		expect(broken.config.issues.join('\n')).toMatch(
			/personal configuration .* does not parse/u,
		);
		expect(broken.accounts.layers.map((each) => each.layer)).toEqual([
			'shared',
			'shared',
		]);
	});
});

describe('runCli', () => {
	const roots: string[] = [];
	const lean = JSON.stringify({
		plugins: { docs: {}, git: {}, memory: {}, search: {} },
	});
	const workspace = async (): Promise<string> => {
		const root = await mkdtemp(join(tmpdir(), 'run-cli-'));
		roots.push(root);
		return root;
	};
	const assembled = () => ({
		registrationOrder: ['t1'],
		start: vi.fn(async () => undefined),
		dispose: vi.fn(async () => undefined),
		server: {},
	});
	beforeEach(() => {
		mocks.create.mockReset();
		mocks.shutdown.mockReset();
		mocks.runInit.mockReset();
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		vi.spyOn(process, 'on').mockImplementation(() => process);
	});
	afterEach(async () => {
		vi.restoreAllMocks();
		process.exitCode = undefined;
		await Promise.all(
			roots
				.splice(0)
				.map((root) => rm(root, { recursive: true, force: true })),
		);
	});

	it('[<50ms] hands `init` to the init command and stops', async () => {
		await runCli(['init', '--yes'], '/cwd');
		expect(mocks.runInit).toHaveBeenCalledWith(['--yes'], '/cwd');
		expect(mocks.create).not.toHaveBeenCalled();
	});

	it('[<300ms] prints the doctor report for --check without starting the server', async () => {
		const root = await workspace();
		mocks.create.mockResolvedValue(assembled());
		await runCli(
			[
				`--workspace=${root}`,
				'--surface=native',
				'--plugins=',
				'--check',
			],
			root,
		);
		expect(process.stdout.write).toHaveBeenCalled();
		expect(mocks.create.mock.calls.length).toBeLessThanOrEqual(1);
	});

	it('[<500ms] exits non-zero when the --check report is not ok', async () => {
		const root = await workspace();
		await runCli(
			[
				`--workspace=${root}`,
				'--surface=native',
				'--plugins=missing-plugin-for-check',
				'--check',
			],
			root,
		);
		expect(process.exitCode).toBe(1);
		expect(mocks.shutdown).not.toHaveBeenCalled();
	});

	it('[<300ms] journals the retired preset on start even with an explicit --config', async () => {
		const root = await workspace();
		await writeFile(join(root, 'shared.config.json'), lean);
		const server = assembled();
		mocks.create.mockResolvedValue(server);
		await runCli(
			[
				`--workspace=${root}`,
				'--config=shared.config.json',
				'--surface=native',
				'--plugins=',
				'--verbose',
				'--mcp-project-create=false',
			],
			root,
		);
		expect(server.start).toHaveBeenCalledOnce();
		const journal = await readFile(
			join(root, '.cache/delendai/preset-migration.jsonl'),
			'utf8',
		);
		expect(JSON.parse(journal.trim())).toMatchObject({ retired: 'lean' });
	});

	it('[<500ms] wires the shutdown signals and prepares the blueprint after boot', async () => {
		const root = await workspace();
		const server = assembled();
		mocks.create.mockResolvedValue(server);
		await runCli(
			[`--workspace=${root}`, '--surface=native', '--plugins='],
			root,
		);
		const signals = vi
			.mocked(process.on)
			.mock.calls.map(([name]) => String(name));
		expect(signals).toEqual(expect.arrayContaining(['SIGTERM', 'SIGINT']));
		const handler = vi
			.mocked(process.on)
			.mock.calls.find(([name]) => String(name) === 'SIGTERM')?.[1] as
			| (() => void)
			| undefined;
		handler?.();
		await vi.waitFor(() => expect(mocks.shutdown).toHaveBeenCalled());
		expect(server.dispose).toHaveBeenCalled();
	});

	it('[<300ms] settles only after the blueprint write finished, so nothing still writes into the workspace', async () => {
		const root = await workspace();
		mocks.create.mockResolvedValue(assembled());
		await runCli(
			[`--workspace=${root}`, '--surface=native', '--plugins='],
			root,
		);
		await expect(
			access(join(root, '.cache/delendai/bootstrap/blueprint.json')),
		).resolves.toBeUndefined();
	});
});
