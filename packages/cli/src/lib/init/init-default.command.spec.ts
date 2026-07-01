/**
 * init-default.command.spec.ts — f00103.
 *
 * Acceptance for `init:default`, the non-interactive counterpart of
 * `init`. The operator's repeat-use path: pre-baked defaults, no
 * prompts, auto-yes for the config overwrite.
 *
 * Covered here:
 *   1. The default answers match the operator's selection
 *      (vertex preset + overwrite + skills + agents + scaffold + force=true).
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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
	hostInstructions: 'overwrite',
	copyCoreSkills: true,
	generateAgentMd: true,
	migrateFromLegacy: true,
	force: true,
};

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
		expect(answers.hostInstructions).toBe('overwrite');
		expect(answers.copyCoreSkills).toBe(true);
		expect(answers.generateAgentMd).toBe(true);
		expect(answers.migrateFromLegacy).toBe(true);
		expect(answers.force).toBe(true);
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

	it('runs the full pipeline end-to-end against a tmpdir (vertex preset + overwrite host-instructions)', async () => {
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

		// The config must include every vertex member (10 plugins:
		// conventions, docs, search, git, web-fetch, status-marker,
		// test-convention, quality, issues, audit). The vertex preset
		// is independent — it does NOT inherit swarm, so
		// `proposals`/`memory`/`rules`/`deps`/`notification`/`logs`
		// MUST NOT be present in the rendered config.
		const configFile = data.files.find(
			(f) => f.relPath === 'mcp-vertex.config.json',
		);
		expect(configFile).toBeDefined();
		const config = JSON.parse(configFile?.content ?? '{}') as {
			plugins: Record<string, unknown>;
		};
		for (const required of [
			'conventions',
			'docs',
			'search',
			'git',
			'web-fetch',
			'status-marker',
			'test-convention',
			'quality',
			'issues',
			'audit',
		]) {
			expect(config.plugins[required]).toBeDefined();
		}
		for (const excluded of [
			'memory',
			'rules',
			'deps',
			'proposals',
			'notification',
			'logs',
		]) {
			expect(config.plugins[excluded]).toBeUndefined();
		}
		// Exactly 10 vertex plugins rendered, no extras added.
		expect(Object.keys(config.plugins).length).toBe(10);
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
		expect(configOnDisk.plugins['git']).toBeDefined();
		expect(configOnDisk.plugins['audit']).toBeDefined();
		expect(configOnDisk.plugins['issues']).toBeDefined();
		expect(configOnDisk.plugins['web-fetch']).toBeDefined();
		expect(configOnDisk.plugins['conventions']).toBeDefined();
		// Swarm-only plugins MUST NOT have been written.
		expect(configOnDisk.plugins['proposals']).toBeUndefined();
		expect(configOnDisk.plugins['memory']).toBeUndefined();

		// Host-instructions centralizer wrote the canonical block under
		// overwrite semantics.
		const agentsContent = await readFile(join(tmp, 'AGENTS.md'), 'utf8');
		expect(agentsContent).toContain('<!-- mcp-vertex:begin -->');
		expect(agentsContent).toContain('<!-- mcp-vertex:end -->');
	});

	it('surfaces a HostEntryNotFoundError envelope when nothing matches and --mcp-vertex-root is absent', async () => {
		const ctx = noopCtx(tmp, minimalGlobals());
		const result = await initDefaultCommand.run([], ctx);
		expect(result.code).toBe(EXIT_CODE.NOT_FOUND);
		const data = result.data as {
			ok: false;
			error: { reason: string; nextAction: string };
			attempted: string[];
		};
		expect(data.ok).toBe(false);
		expect(data.error.reason).toMatch(
			/could not locate the mcp-vertex host entry script/,
		);
		expect(data.error.nextAction).toBe('retry');
		expect(data.attempted.length).toBeGreaterThan(0);
		// The hint must mention the override flag so the operator knows
		// how to recover without re-installing the package.
		expect(data.error.reason).toContain('--mcp-vertex-root=');
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
});
