/**
 * f00046 S10 — doctor + completion tests. Doctor rolls section statuses
 * onto the exit code; completion derives a shell script from the command
 * list (pure generator).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
} from '../../contracts/interfaces/cli-command.interface';
import {
	analyzeConfigRoots,
	doctorCommands,
	renderDoctorSummary,
	runDoctorBody,
} from './doctor';
import {
	buildCompletionModel,
	generateCompletion,
} from '../../lib/completion/completion.service';
import {
	checkGitStatus,
	checkManifests,
	checkPermissions,
	checkRuntime,
	checkStaleDocs,
} from '../../lib/doctor/checks';
import { computeScore } from '../../lib/doctor/score';

const buildStubContext = (response: unknown, json = false) => {
	const ctx: ICliCommandContext = {
		cwd: '/workspace',
		globals: {
			workspace: '/workspace',
			json,
			format: json ? 'json' : 'text',
			lang: 'en',
			noColor: false,
			plugins: [],
		},
		request: async <TOut>(): Promise<TOut> => response as TOut,
		listTools: async () => [],
		close: async () => {},
	};
	return ctx;
};

const find = (name: string): ICliCommand => {
	const command = doctorCommands.find((c) => c.name === name);
	if (command === undefined) throw new Error(`missing command: ${name}`);
	return command;
};

describe('doctor (f00046 S10)', async () => {
	it('reports ok (exit 0) when plugins + tools are healthy', async () => {
		const ctx = buildStubContext({
			plugins: ['a', 'b'],
			tools: ['t1', 't2'],
			pluginDiagnostic: { missing: [], errors: 0 },
		});
		// f00191: skip the pure workspace checks so the test stays a
		// pure-IO unit (the real checks run against the actual workspace
		// tree and would warn on the stub `/workspace` path).
		const res = await runDoctorBody(ctx, { extraChecks: [] });
		expect(res.code).toBe(EXIT_CODE.OK);
		expect((res.data as { status: string }).status).toBe('ok');
	});

	it('warns (non-zero) when a configured plugin is missing', async () => {
		const ctx = buildStubContext({
			plugins: ['a'],
			tools: ['t1'],
			pluginDiagnostic: { missing: ['b'], errors: 1 },
		});
		const res = await runDoctorBody(ctx, { extraChecks: [] });
		expect(res.code).toBe(EXIT_CODE.VALIDATION);
		expect((res.data as { status: string }).status).toBe('warn');
	});

	it('a00060: counts tools correctly when overview.tools is grouped-by-plugin (compact mode real shape), not a flat array', async () => {
		const ctx = buildStubContext({
			plugins: ['a', 'b'],
			tools: { a: ['t1', 't2'], b: ['t3'] },
			pluginDiagnostic: { missing: [], errors: 0 },
		});
		const res = await runDoctorBody(ctx, { extraChecks: [] });
		const body = res.data as {
			status: string;
			sections: Array<{ name: string; findings: readonly string[] }>;
		};
		const toolsSection = body.sections.find((s) => s.name === 'tools');
		expect(toolsSection?.findings).toContain('3 tool(s) registered');
		expect(body.status).toBe('ok');
	});

	it('f00191: command group wires runDoctorBody so the production code path matches the test path', async () => {
		const ctx = buildStubContext({
			plugins: ['a'],
			tools: ['t1'],
			pluginDiagnostic: { missing: [], errors: 0 },
		});
		const res = await find('doctor').run([], ctx);
		// Without overriding extraChecks the production command runs the
		// default pure checks; on a real workspace those pass and the
		// overall status stays 'ok' (or warn, depending on tree state).
		// We only assert shape here, not exact status.
		expect(['ok', 'warn']).toContain(
			(res.data as { status: string }).status,
		);
	});
});

describe('analyzeConfigRoots (a00064 — config-vs-reality preflight)', () => {
	it('flags configured roots that do not exist in the workspace', () => {
		const config = {
			plugins: {
				search: {
					options: { roots: ['packages', 'src'] },
				},
				conventions: { options: { roots: ['plugins'] } },
				git: { options: {} },
			},
		};
		const section = analyzeConfigRoots(config, (rel) => rel === 'src');
		expect(section.status).toBe('warn');
		const joined = section.findings.join('\n');
		expect(joined).toContain('plugins.search.options.roots');
		expect(joined).toContain('packages');
		expect(joined).not.toContain("'src'");
		expect(joined).toContain('plugins.conventions.options.roots');
	});

	it('reports ok when every configured root exists (or none are declared)', () => {
		const config = {
			plugins: {
				search: { options: { roots: ['src'] } },
				git: { options: {} },
			},
		};
		const section = analyzeConfigRoots(config, () => true);
		expect(section.status).toBe('ok');
	});

	it('handles a config without plugins gracefully', () => {
		const section = analyzeConfigRoots({}, () => false);
		expect(section.status).toBe('ok');
	});
});

describe('renderDoctorSummary (a00060 — doctor was silent by default)', () => {
	it('renders every section name, status and findings', () => {
		const text = renderDoctorSummary('warn', [
			{ name: 'env', status: 'ok', findings: ['workspace: /repo'] },
			{
				name: 'tools',
				status: 'warn',
				findings: ['0 tool(s) registered'],
			},
		]);
		expect(text).toContain('env');
		expect(text).toContain('workspace: /repo');
		expect(text).toContain('tools');
		expect(text).toContain('0 tool(s) registered');
		expect(text).toContain('warn');
	});
});

describe('doctor default-mode output (a00060)', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('prints a human summary to stderr when --json is not set', async () => {
		const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const ctx = buildStubContext(
			{
				plugins: ['a'],
				tools: ['t1'],
				pluginDiagnostic: { missing: [], errors: 0 },
			},
			false,
		);
		await find('doctor').run([], ctx);
		expect(spy).toHaveBeenCalled();
		const printed = spy.mock.calls.map((c) => String(c[0])).join('');
		expect(printed).toContain('plugins');
	});

	it('does not print to stderr when --json is set (structured stdout only)', async () => {
		const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const ctx = buildStubContext(
			{
				plugins: ['a'],
				tools: ['t1'],
				pluginDiagnostic: { missing: [], errors: 0 },
			},
			true,
		);
		await find('doctor').run([], ctx);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe('completion (f00046 S10)', async () => {
	const names = ['status', 'git status', 'git log', 'memory save'];

	it('builds a model of leaves + groups', async () => {
		const model = buildCompletionModel(names);
		expect(model.leaves).toContain('status');
		// Verbs keep insertion order; the generators sort them on emit.
		expect(model.groups.get('git')).toEqual(['status', 'log']);
		expect(model.firstWords).toEqual(['git', 'memory', 'status']);
	});

	it('generates non-empty bash/zsh/fish scripts mentioning a group verb', async () => {
		for (const shell of ['bash', 'zsh', 'fish'] as const) {
			const script = generateCompletion(shell, names);
			expect(script.length).toBeGreaterThan(0);
			expect(script).toContain('git');
		}
	});

	it('rejects an unknown shell with USAGE', async () => {
		const ctx = buildStubContext({});
		const res = await find('completion').run(['powershell'], ctx);
		expect(res.code).toBe(EXIT_CODE.USAGE);
	});

	it('emits a bash script for `completion bash`', async () => {
		const ctx = buildStubContext({});
		const res = await find('completion').run(['bash'], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect(res.text).toContain('complete -F _mcpv_complete mcpv');
		// The completion script generator walks the full command tree
		// (~30 commands) and emits a bash function with a long case
		// branch. On a cold cache + parallel test load it can take ~1s —
		// well above the 5s default in normal conditions, but the 5s
		// vitest default occasionally flips this test. Bumping to 15s
		// keeps the assertion sharp without flaking on slow CI.
	}, 15_000);
});

// ============================================================================
// f00191 / q00006 Track I — health-check completeness + score + P0/P1/P2
// ============================================================================

describe('computeScore (f00191)', () => {
	it('returns 100 when every section is ok', () => {
		const score = computeScore([
			{ name: 'env', status: 'ok', findings: ['workspace: /w'] },
		]);
		expect(score.value).toBe(100);
		expect(score.p0).toEqual([]);
		expect(score.p1).toEqual([]);
		// `ok` findings are not bucketed — `Health: 100/100` means a
		// healthy run, regardless of how many `ok` rows appear.
		expect(score.p2).toEqual([]);
	});

	it('drops 25 per P0 finding (error section)', () => {
		const score = computeScore([
			{
				name: 'plugins',
				status: 'error',
				findings: ['server unreachable'],
			},
			{ name: 'env', status: 'ok', findings: ['workspace: /w'] },
		]);
		expect(score.value).toBe(75);
		expect(score.p0).toEqual(['plugins: server unreachable']);
		expect(score.p1).toEqual([]);
		expect(score.p2).toEqual([]);
	});

	it('drops 10 per P1 finding (warn section)', () => {
		const score = computeScore([
			{
				name: 'manifests',
				status: 'warn',
				findings: ['missing plugin.manifest.ts: foo'],
			},
		]);
		expect(score.value).toBe(90);
		expect(score.p1).toHaveLength(1);
	});

	it('floors at 0 when there are many P0 findings', () => {
		const score = computeScore([
			{ name: 'a', status: 'error', findings: ['x', 'y', 'z', 'w'] },
		]);
		expect(score.value).toBe(0);
		expect(score.p0).toHaveLength(4);
	});
});

describe('renderDoctorSummary with score (f00191)', () => {
	it('renders a `Health: NN/100` line + P0/P1/P2 buckets when score is provided', () => {
		const text = renderDoctorSummary(
			'warn',
			[
				{
					name: 'manifests',
					status: 'warn',
					findings: ['missing plugin.manifest.ts: foo'],
				},
			],
			computeScore([
				{
					name: 'manifests',
					status: 'warn',
					findings: ['missing plugin.manifest.ts: foo'],
				},
			]),
		);
		expect(text).toContain('Health: 90/100');
		expect(text).toContain('P0 (must fix):');
		expect(text).toContain('P1 (should fix):');
		expect(text).toContain('P2 (cosmetic):');
		expect(text).toContain('manifests: missing plugin.manifest.ts: foo');
	});

	it('renders the legacy shape (no score) when score is omitted', () => {
		const text = renderDoctorSummary('ok', [
			{ name: 'env', status: 'ok', findings: ['workspace: /w'] },
		]);
		expect(text).not.toContain('Health:');
		expect(text).toContain('doctor: ok');
	});
});

describe('checkManifests (f00191)', () => {
	const fsOk = {
		fileExists: async (rel: string) =>
			rel === 'plugins/git/plugin.manifest.ts',
		readFile: async (rel: string) =>
			rel === 'plugins/git/plugin.manifest.ts'
				? "import { definePluginManifest } from 'x';\nexport default definePluginManifest({\n\tid: 'git',\n});"
				: undefined,
		listDirs: async (_rel: string) => ['git'],
	};
	const ctx = {
		workspace: '/w',
		fs: fsOk,
		now: () => new Date('2026-08-26T00:00:00Z'),
	};

	it('reports ok when all manifests are present and well-formed', async () => {
		const section = await checkManifests(ctx);
		expect(section.status).toBe('ok');
		expect(section.findings[0]).toContain('1 plugin manifest(s)');
	});

	it('flags missing plugin.manifest.ts files', async () => {
		const section = await checkManifests({
			...ctx,
			fs: {
				...fsOk,
				fileExists: async () => false,
				listDirs: async () => ['git', 'logs'],
			},
		});
		expect(section.status).toBe('warn');
		expect(section.findings.join('\n')).toContain('git, logs');
	});

	it('warns when no plugins directory exists', async () => {
		const section = await checkManifests({
			...ctx,
			fs: { ...fsOk, listDirs: async () => [] },
		});
		expect(section.status).toBe('warn');
		expect(section.findings[0]).toContain('no plugin directories');
	});
});

describe('checkRuntime (f00191)', () => {
	const fsWithPkg = (floor: string) => ({
		fileExists: async () => true,
		readFile: async () => JSON.stringify({ engines: { bun: floor } }),
		listDirs: async (): Promise<readonly string[]> => [],
	});

	// `globalThis.Bun` is a built-in getter on vitest 4 / Bun hosts —
	// direct assignment throws `TypeError: Attempted to assign to readonly
	// property`. `Object.defineProperty` re-defines it as a writable,
	// configurable data property for the duration of the test.
	const installBun = (version: string | undefined): (() => void) => {
		const target = globalThis as Record<string, unknown>;
		const hadDescriptor = Object.getOwnPropertyDescriptor(target, 'Bun');
		Object.defineProperty(target, 'Bun', {
			value: version === undefined ? undefined : { version },
			writable: true,
			configurable: true,
			enumerable: true,
		});
		return () => {
			if (hadDescriptor === undefined) {
				Object.defineProperty(target, 'Bun', {
					value: undefined,
					writable: true,
					configurable: true,
					enumerable: true,
				});
			} else {
				Object.defineProperty(target, 'Bun', hadDescriptor);
			}
		};
	};

	it('reports ok when active Bun version meets the floor', async () => {
		const restore = installBun('1.3.14');
		try {
			const section = await checkRuntime({
				workspace: '/w',
				fs: fsWithPkg('>=1.1.0'),
				now: () => new Date(),
			});
			expect(section.status).toBe('ok');
			expect(section.findings[0]).toContain('1.3.14');
		} finally {
			restore();
		}
	});

	it('reports error when Bun is below the floor', async () => {
		const restore = installBun('1.0.0');
		try {
			const section = await checkRuntime({
				workspace: '/w',
				fs: fsWithPkg('>=1.1.0'),
				now: () => new Date(),
			});
			expect(section.status).toBe('error');
			expect(section.findings[0]).toContain('below floor');
		} finally {
			restore();
		}
	});

	it('reports error when no Bun runtime is active', async () => {
		const restore = installBun(undefined);
		try {
			const section = await checkRuntime({
				workspace: '/w',
				fs: fsWithPkg('>=1.1.0'),
				now: () => new Date(),
			});
			expect(section.status).toBe('error');
			expect(section.findings.join('\n')).toContain('not Bun');
		} finally {
			restore();
		}
	});

	it('reports warn when engines.bun is missing', async () => {
		const section = await checkRuntime({
			workspace: '/w',
			fs: {
				fileExists: async () => true,
				readFile: async () => '{}',
				listDirs: async (): Promise<readonly string[]> => [],
			},
			now: () => new Date(),
		});
		expect(section.status).toBe('warn');
	});
});

describe('checkGitStatus (f00191)', () => {
	const cleanProbe = { status: async () => 'clean' as const };
	const dirtyProbe = { status: async () => 'dirty' as const };
	const noGitProbe = { status: async () => 'no-git' as const };
	const baseCtx = {
		workspace: '/w',
		fs: {
			fileExists: async () => false,
			readFile: async () => undefined,
			listDirs: async (): Promise<readonly string[]> => [],
		},
		now: () => new Date(),
	};

	it('reports ok on a clean tree', async () => {
		const section = await checkGitStatus(cleanProbe)(baseCtx);
		expect(section.status).toBe('ok');
	});

	it('reports warn (never error) on a dirty tree', async () => {
		const section = await checkGitStatus(dirtyProbe)(baseCtx);
		expect(section.status).toBe('warn');
	});

	it('reports ok on a non-git workspace', async () => {
		const section = await checkGitStatus(noGitProbe)(baseCtx);
		expect(section.status).toBe('ok');
		expect(section.findings[0]).toContain('not a git repository');
	});
});

describe('checkStaleDocs (f00191)', () => {
	const emptyProbe = {
		staleFiles: async (): Promise<readonly string[]> => [],
	};
	const someStaleProbe = {
		staleFiles: async (): Promise<readonly string[]> => [
			'apps/web/src/data/plugins/catalog.generated.ts',
		],
	};
	const baseCtx = {
		workspace: '/w',
		fs: {
			fileExists: async () => false,
			readFile: async () => undefined,
			listDirs: async (): Promise<readonly string[]> => [],
		},
		now: () => new Date(),
	};

	it('reports ok when nothing is stale', async () => {
		const section = await checkStaleDocs(emptyProbe)(baseCtx);
		expect(section.status).toBe('ok');
	});

	it('reports the stale files and how to refresh', async () => {
		const section = await checkStaleDocs(someStaleProbe)(baseCtx);
		expect(section.status).toBe('warn');
		expect(section.findings[0]).toContain('catalog.generated.ts');
		expect(section.findings[0]).toContain('gen-all');
	});
});

describe('checkPermissions (f00191)', () => {
	const mkFs = (bodies: ReadonlyMap<string, string>) => ({
		fileExists: async (rel: string) => bodies.has(rel),
		readFile: async (rel: string) => bodies.get(rel),
		listDirs: async (): Promise<readonly string[]> =>
			[
				...[...new Set([...bodies.keys()].map((k) => k.split('/')[1]))],
			].filter((entry): entry is string => typeof entry === 'string'),
	});
	const baseCtx = {
		workspace: '/w',
		fs: mkFs(new Map()),
		now: () => new Date(),
	};

	it('reports ok when every permission is in the known set', async () => {
		const section = await checkPermissions({
			...baseCtx,
			fs: mkFs(
				new Map([
					[
						'plugins/git/plugin.manifest.ts',
						"import { definePluginManifest } from 'x';\nexport default definePluginManifest({\n\tid: 'git',\n\tpermissions: ['git-read', 'git-write'],\n});",
					],
				]),
			),
		});
		expect(section.status).toBe('ok');
	});

	it('flags unknown permissions', async () => {
		const section = await checkPermissions({
			...baseCtx,
			fs: mkFs(
				new Map([
					[
						'plugins/weird/plugin.manifest.ts',
						"import { definePluginManifest } from 'x';\nexport default definePluginManifest({\n\tid: 'weird',\n\tpermissions: ['teleportation'],\n});",
					],
				]),
			),
		});
		expect(section.status).toBe('warn');
		expect(section.findings.join('\n')).toContain('weird');
		expect(section.findings.join('\n')).toContain('teleportation');
	});

	it('reports ok when there are no plugin manifests to inspect', async () => {
		const section = await checkPermissions(baseCtx);
		expect(section.status).toBe('ok');
	});
});
