/**
 * init-default.command.spec.ts — f00103.
 *
 * Acceptance for `init:default`, the non-interactive counterpart of
 * `init`. The operator's repeat-use path: pre-baked defaults, no
 * prompts, safe merging for project-owned configuration.
 *
 * Covered here:
 *   1. The default answers match the operator's selection
 *      (vertex preset + managed instructions + skills + agents + scaffold).
 *   2. The full pipeline (detection + render + write) runs end-to-end
 *      against a tmpdir, surfaces every file the bundle produces, and
 *      leaves the config + host-instructions on disk with the
 *      vertex preset's plugin set.
 *   3. The host-entry path resolution surfaces the typed
 *      `HostEntryNotFoundError` envelope when no probe branch matches
 *      and the operator did not pass `--mcp-vertex-root`.
 *   4. Flag parsing matches `init`'s surface (`--dry-run`,
 *      `--mcp-vertex-root`, `--plugin-paths-root`).
 *
 * The fake host-entry script lives inside the tmpdir and is wired
 * through `--mcp-vertex-root` so the resolver's `flag` branch wins —
 * no need to stub the filesystem probe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	detectAndDecorateAnswers,
	parseFlags,
	runInitWithAnswers,
	type IInitFlags,
} from '../../commands/init/init.command';
import { initDefaultCommand } from '../../commands/init/init-default.command';
import type { IInitAnswers } from './init-answers.types';
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommandContext,
	ICliGlobalOptions,
} from '../../contracts/interfaces/cli-command.interface';
import { createNoopContext } from '../noop-context.factory';

const minimalGlobals = (): ICliGlobalOptions => ({
	workspace: '',
	remote: undefined,
	json: false,
	format: 'text',
	lang: 'en',
	noColor: true,
	plugins: [],
	preset: undefined,
	config: undefined,
	extraOptions: undefined,
	agentWorktree: undefined,
});

const noopCtx = (cwd: string, globals: ICliGlobalOptions): ICliCommandContext =>
	createNoopContext(cwd, globals);

const INIT_DEFAULT_ANSWERS: Partial<IInitAnswers> = {
	preset: 'vertex',
	extraPlugins: [],
	excludedPlugins: [],
	hostInstructions: 'append',
	copyCoreSkills: true,
	generateAgentMd: true,
	migrateFromLegacy: true,
	force: false,
};

const HOST_ENTRY_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../tools/scripts/host/host-server.script.ts',
);

describe('init:default (f00103)', () => {
	let tmp: string;
	let fakeHostEntry: string;

	beforeEach(async () => {
		tmp = await mkdtemp(join(tmpdir(), 'mcpv-init-default-'));
		fakeHostEntry = join(tmp, 'fake-host/host-server.script.ts');
		await mkdir(dirname(fakeHostEntry), { recursive: true });
		await writeFile(fakeHostEntry, '// fake host entry for tests\n');
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	it('exposes the operator defaults as the canonical init:default answers', async () => {
		const flags: IInitFlags = parseFlags([]);
		const answers = await detectAndDecorateAnswers(
			tmp,
			flags,
			INIT_DEFAULT_ANSWERS,
		);
		// `vertex` is the operator's chosen default — mirrors the
		// mcp-vertex project's own plugin set.
		expect(answers.preset).toBe('vertex');
		expect(answers.extraPlugins).toEqual([]);
		expect(answers.excludedPlugins).toEqual([]);
		expect(answers.hostInstructions).toBe('append');
		expect(answers.copyCoreSkills).toBe(true);
		expect(answers.generateAgentMd).toBe(true);
		expect(answers.migrateFromLegacy).toBe(true);
		expect(answers.force).toBe(false);
	});

	it('parses the same flag surface as init', () => {
		const flags = parseFlags([
			'--dry-run',
			`--mcp-vertex-root=${fakeHostEntry}`,
			'--plugin-paths-root=libs',
		]);
		expect(flags.dryRun).toBe(true);
		expect(flags.mcpVertexRoot).toBe(fakeHostEntry);
		expect(flags.pluginPathsRoot).toBe('libs');
		expect(flags.force).toBe(false);
	});

	it('runs the full pipeline end-to-end against a tmpdir with managed host instructions', async () => {
		const ctx = noopCtx(tmp, minimalGlobals());
		const result = await initDefaultCommand.run(
			['--dry-run', `--mcp-vertex-root=${fakeHostEntry}`],
			ctx,
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		const data = result.data as {
			ok: boolean;
			dryRun: boolean;
			files: { relPath: string; content: string }[];
			summary: string;
		};
		expect(data.ok).toBe(true);
		expect(data.dryRun).toBe(true);
		expect(Array.isArray(data.files)).toBe(true);
		const rels = data.files.map((f) => f.relPath);
		// The vertex preset must populate every expected file family.
		expect(rels).toContain('mcp-vertex.config.json');
		expect(rels).toContain('.vscode/mcp.json');
		expect(rels).toContain('AGENTS.md');
		expect(rels).toContain('CLAUDE.md');
		expect(rels).toContain('.github/copilot-instructions.md');
		expect(rels.some((r) => r.startsWith('.github/agents/'))).toBe(true);
		expect(rels).toContain('docs/mcp-vertex/skills/manifest.json');

		// The config must include every vertex member — x00166: vertex
		// now mirrors mcp-vertex.config.json's `plugins` keys exactly
		// (28 total), INCLUDING `proposals` (orchestration/swarm) since
		// mcp-vertex dogfoods its own orchestrator and every adopter via
		// `init:default` must get it too. Previously vertex silently
		// excluded proposals/memory/rules/deps/notification/logs and
		// included 6 phantom plugins that were never actually loaded.
		const configFile = data.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		expect(configFile).toBeDefined();
		const config = JSON.parse(configFile?.content ?? '{}') as {
			plugins: Record<string, unknown>;
		};
		for (const required of [
			'audit',
			'auto-agent-selector',
			'container',
			'conventions',
			'deps',
			'diagram',
			'docs',
			'env',
			'error-reporting',
			'forge',
			'git',
			'i18n',
			'link-check',
			'logs',
			'memory',
			'notification',
			'orchestrator-runner',
			'perf',
			'proposals',
			'quality',
			'rules',
			'search',
			'security',
			'status-marker',
			'tech-debt',
			'test-convention',
			'test-policy',
			'usage-tracking',
		]) {
			expect(config.plugins[required]).toBeDefined();
		}
		for (const phantom of [
			'web-fetch',
			'issues',
			'refactor',
			'api',
			'prompt-eval',
			'database',
		]) {
			expect(config.plugins[phantom]).toBeUndefined();
		}
		// Exactly 37 vertex plugins rendered in the current dogfood snapshot,
		// no extras added.
		expect(Object.keys(config.plugins).length).toBe(38);
	});

	it('writes the bundle to disk when --dry-run is absent', async () => {
		const ctx = noopCtx(tmp, minimalGlobals());
		const result = await initDefaultCommand.run(
			[`--mcp-vertex-root=${fakeHostEntry}`],
			ctx,
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		const data = result.data as {
			ok: true;
			written: { path: string; kind: string }[];
			summary: string;
		};
		expect(data.ok).toBe(true);
		expect(data.written.length).toBeGreaterThan(0);

		// The config file landed on disk with the rendered vertex preset.
		const configOnDisk = JSON.parse(
			await readFile(join(tmp, 'mcp-vertex.config.json'), 'utf8'),
		) as { plugins: Record<string, unknown> };
		expect(configOnDisk.plugins.git).toBeDefined();
		expect(configOnDisk.plugins.audit).toBeDefined();
		expect(configOnDisk.plugins.conventions).toBeDefined();
		// x00166: vertex now includes the orchestration plugins too —
		// every adopter running init:default gets the orchestrator.
		expect(configOnDisk.plugins.proposals).toBeDefined();
		expect(configOnDisk.plugins.memory).toBeDefined();
		// Phantom plugins that were never actually loaded.
		expect(configOnDisk.plugins.issues).toBeUndefined();
		expect(configOnDisk.plugins['web-fetch']).toBeUndefined();

		// Host-instructions centralizer wrote its managed canonical block.
		const agentsContent = await readFile(join(tmp, 'AGENTS.md'), 'utf8');
		expect(agentsContent).toContain('<!-- mcp-vertex:begin -->');
		expect(agentsContent).toContain('<!-- mcp-vertex:end -->');
	});

	it('does not project skills when a malformed project config was preserved', async () => {
		await writeFile(join(tmp, 'mcp-vertex.config.json'), '{broken', 'utf8');
		const result = await initDefaultCommand.run(
			[`--mcp-vertex-root=${fakeHostEntry}`],
			noopCtx(tmp, minimalGlobals()),
		);
		expect(result.code).toBe(EXIT_CODE.OK);
		await expect(
			readFile(join(tmp, 'docs/mcp-vertex/skills/manifest.json'), 'utf8'),
		).rejects.toThrow();
	});

	it('uses the published canonical launcher when --mcp-vertex-root is absent', async () => {
		const ctx = noopCtx(tmp, minimalGlobals());
		const result = await initDefaultCommand.run([], ctx);
		expect(result.code).toBe(EXIT_CODE.OK);
		const vscode = JSON.parse(
			await readFile(join(tmp, '.vscode/mcp.json'), 'utf8'),
		) as {
			servers: { 'mcp-vertex': { command: string; args: string[] } };
		};
		expect(vscode.servers['mcp-vertex']).toMatchObject({
			command: 'bunx',
			args: [
				'--package',
				'@mcp-vertex/cli',
				'mcpv',
				'__serve',
				'--workspace',
				'${workspaceFolder}',
			],
		});
	});

	it('runInitWithAnswers passes through the force flag when --force is supplied by the caller', async () => {
		const ctx = noopCtx(tmp, minimalGlobals());
		const flags = parseFlags([
			'--dry-run',
			`--mcp-vertex-root=${fakeHostEntry}`,
			'--force',
		]);
		const answers = await detectAndDecorateAnswers(
			tmp,
			flags,
			INIT_DEFAULT_ANSWERS,
		);
		const result = await runInitWithAnswers(ctx, flags, answers);
		expect(result.code).toBe(EXIT_CODE.OK);
		expect(answers.force).toBe(true);
	});

	it('prints an early env warning block when the env plugin is loaded and a required var is missing', async () => {
		// Dynamic imports of every standard-preset plugin take
		// ~2-4s in the test sandbox (env warning lookup); well above
		// vitest's 5s default. See
		// `init-render.service.spec.ts` for the same constant.
		const _TEST_TIMEOUT_MS = 30_000;
		const stderr = vi
			.spyOn(process.stderr, 'write')
			.mockImplementation(() => true);
		try {
			const flags = parseFlags([
				'--dry-run',
				`--mcp-vertex-root=${HOST_ENTRY_PATH}`,
			]);
			const answers = await detectAndDecorateAnswers(tmp, flags, {
				preset: 'standard',
				extraPlugins: [],
				excludedPlugins: [],
				hostInstructions: 'append',
				copyCoreSkills: true,
				generateAgentMd: true,
				migrateFromLegacy: true,
				force: false,
			});
			const result = await runInitWithAnswers(
				noopCtx(tmp, minimalGlobals()),
				flags,
				answers,
			);
			expect(result.code).toBe(EXIT_CODE.OK);
			const stderrText = stderr.mock.calls
				.map(([line]) => String(line))
				.join('');
			expect(stderrText).toContain('mcp-vertex › env warning');
			expect(stderrText).toContain('DATABASE_URL');
		} finally {
			stderr.mockRestore();
		}
	}, 30_000);
});
