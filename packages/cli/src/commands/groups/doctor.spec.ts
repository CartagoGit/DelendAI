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
} from './doctor';
import {
	buildCompletionModel,
	generateCompletion,
} from '../../lib/completion/completion.service';

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
		const res = await find('doctor').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.OK);
		expect((res.data as { status: string }).status).toBe('ok');
	});

	it('warns (non-zero) when a configured plugin is missing', async () => {
		const ctx = buildStubContext({
			plugins: ['a'],
			tools: ['t1'],
			pluginDiagnostic: { missing: ['b'], errors: 1 },
		});
		const res = await find('doctor').run([], ctx);
		expect(res.code).toBe(EXIT_CODE.VALIDATION);
		expect((res.data as { status: string }).status).toBe('warn');
	});

	it('a00060: counts tools correctly when overview.tools is grouped-by-plugin (compact mode real shape), not a flat array', async () => {
		const ctx = buildStubContext({
			plugins: ['a', 'b'],
			tools: { a: ['t1', 't2'], b: ['t3'] },
			pluginDiagnostic: { missing: [], errors: 0 },
		});
		const res = await find('doctor').run([], ctx);
		const body = res.data as {
			status: string;
			sections: Array<{ name: string; findings: readonly string[] }>;
		};
		const toolsSection = body.sections.find((s) => s.name === 'tools');
		expect(toolsSection?.findings).toContain('3 tool(s) registered');
		expect(body.status).toBe('ok');
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
	}, // The completion script generator walks the full command tree
	// (~30 commands) and emits a bash function with a long case branch.
	// On a cold cache + parallel test load it can take ~1s — well above
	// the 5s default in normal conditions but the 5s vitest default
	// occasionally flips this test. Bumping to 15s keeps the assertion
	// sharp without flaking on slow CI.
	15_000);
});
