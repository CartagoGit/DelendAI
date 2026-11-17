/**
 * `doctor --ci`, `--offline` and `--deep`: the report a pipeline reads,
 * what offline refuses to pass silently, and the self-test that must
 * never reach `gh issue create`.
 */
import { describe, expect, it, vi } from 'vitest';

import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type {
	IErrorReportingSelfTestInput,
	IErrorReportingSelfTestRunner,
} from '../../contracts/interfaces/doctor-modes.interface';
import type { ICliCommandContext } from '../../contracts/interfaces/cli-command.interface';
import { doctorCommands, runDoctorBody } from '../../commands/groups/doctor';
import { createErrorReportingSelfTestCheck } from './deep-checks.service';
import { parseDoctorModes } from './doctor-modes.service';

const buildContext = (
	request: () => Promise<unknown>,
	remote?: string,
): ICliCommandContext => ({
	cwd: '/workspace',
	globals: {
		workspace: '/workspace',
		json: true,
		format: 'json',
		lang: 'en',
		noColor: false,
		plugins: [],
		remote,
	},
	request: (async () => request()) as ICliCommandContext['request'],
	listTools: async () => [],
	close: async () => {},
});

const healthy = async () => ({
	plugins: ['a'],
	tools: ['t'],
	pluginDiagnostic: { missing: [], errors: 0 },
});

type Payload = {
	status: string;
	sections: { name: string; status: string; findings: string[] }[];
	ci?: {
		exitCode: number;
		meaning: string;
		failing: string[];
		skipped: string[];
	};
};

describe('parseDoctorModes', () => {
	it('reads the three flags independently', () => {
		expect(parseDoctorModes(['--ci', '--deep'])).toEqual({
			ci: true,
			offline: false,
			deep: true,
		});
	});
});

describe('doctor command flags', () => {
	it('declares ci, offline and deep so they are not refused', () => {
		const command = doctorCommands.find((c) => c.name === 'doctor');
		expect(command?.flags).toEqual(['ci', 'offline', 'deep']);
	});
});

describe('doctor --ci', () => {
	it('adds the documented exit code and failing sections on a broken fixture', async () => {
		const broken = async () => {
			throw new Error('server down');
		};
		const res = await runDoctorBody(buildContext(broken), {
			extraChecks: [],
			modes: { ci: true, offline: false, deep: false },
		});
		const payload = res.data as Payload;
		expect(res.code).toBe(EXIT_CODE.RUNTIME);
		expect(payload.ci?.exitCode).toBe(EXIT_CODE.RUNTIME);
		expect(payload.ci?.failing).toEqual(['plugins']);
		expect(payload.ci?.meaning).toContain('P0');
	});

	it('leaves the report without a ci block when not asked', async () => {
		const res = await runDoctorBody(buildContext(healthy), {
			extraChecks: [],
		});
		expect((res.data as Payload).ci).toBeUndefined();
	});

	it('does not write the human recap to stderr', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const ctx = {
			...buildContext(healthy),
			globals: { ...buildContext(healthy).globals, json: false },
		};
		await runDoctorBody(ctx, {
			extraChecks: [],
			modes: { ci: true, offline: false, deep: false },
		});
		expect(write).not.toHaveBeenCalled();
		write.mockRestore();
	});
});

describe('doctor --offline', () => {
	it('reports the remote server sections as skipped, never as passed, and does not ask it', async () => {
		const request = vi.fn(healthy);
		const res = await runDoctorBody(
			buildContext(request, 'https://x.example'),
			{
				extraChecks: [],
				modes: { ci: true, offline: true, deep: false },
			},
		);
		const payload = res.data as Payload;
		expect(request).not.toHaveBeenCalled();
		expect(payload.sections.map((s) => [s.name, s.status])).toEqual(
			expect.arrayContaining([
				['plugins', 'not-applicable'],
				['tools', 'not-applicable'],
			]),
		);
		expect(payload.ci?.skipped).toEqual(['plugins', 'tools']);
	});

	it('still asks a local server, which needs no network', async () => {
		const request = vi.fn(healthy);
		await runDoctorBody(buildContext(request), {
			extraChecks: [],
			modes: { ci: false, offline: true, deep: false },
		});
		expect(request).toHaveBeenCalledTimes(1);
	});

	it('skips a deep check marked requiresNetwork instead of running it', async () => {
		const run = vi.fn();
		const res = await runDoctorBody(buildContext(healthy), {
			extraChecks: [],
			modes: { ci: false, offline: true, deep: true },
			deepChecks: [{ id: 'needs-net', requiresNetwork: true, run }],
		});
		expect(run).not.toHaveBeenCalled();
		expect(
			(res.data as Payload).sections.find((s) => s.name === 'needs-net')
				?.status,
		).toBe('not-applicable');
	});
});

describe('doctor --deep', () => {
	const okRunner = (calls: IErrorReportingSelfTestInput[]) =>
		(async (input) => {
			calls.push(input);
			return {
				ok: true,
				checks: [
					{ id: 'plugin-loaded', ok: true },
					{
						id: 'gh-installed',
						ok: true,
						skipped: true,
						detail: 'pass live: true',
					},
				],
			};
		}) satisfies IErrorReportingSelfTestRunner;

	it('runs the self-test as a section and never creates an issue', async () => {
		const calls: IErrorReportingSelfTestInput[] = [];
		const ghCreateCalls: string[][] = [];
		const exec = async (argv: readonly string[]) => {
			if (argv[0] === 'issue' && argv[1] === 'create') {
				ghCreateCalls.push([...argv]);
			}
			return { ok: true, stdout: '', stderr: '', code: 0 };
		};
		const runner: IErrorReportingSelfTestRunner = async (input) => {
			calls.push(input);
			await (input.exec as typeof exec | undefined)?.(['--version']);
			return { ok: true, checks: [{ id: 'plugin-loaded', ok: true }] };
		};
		const check = createErrorReportingSelfTestCheck(async () => runner);
		const res = await runDoctorBody(buildContext(healthy), {
			extraChecks: [],
			modes: { ci: false, offline: false, deep: true },
			deepChecks: [check],
		});
		const section = (res.data as Payload).sections.find(
			(s) => s.name === 'error-reporting-self-test',
		);
		expect(section?.status).toBe('ok');
		expect(calls).toHaveLength(1);
		expect(ghCreateCalls.length).toBe(0);
	});

	it('does not run deep checks without the flag', async () => {
		const run = vi.fn();
		await runDoctorBody(buildContext(healthy), {
			extraChecks: [],
			deepChecks: [{ id: 'x', requiresNetwork: false, run }],
		});
		expect(run).not.toHaveBeenCalled();
	});

	it('passes live: false offline, and reports the skipped gh checks as skipped', async () => {
		const calls: IErrorReportingSelfTestInput[] = [];
		const check = createErrorReportingSelfTestCheck(async () =>
			okRunner(calls),
		);
		const section = await check.run({ offline: true });
		expect(calls[0]?.live).toBe(false);
		expect(
			section.findings.some((f) => f.startsWith('skipped: gh-installed')),
		).toBe(true);
	});

	it('fails the section when a self-test check fails', async () => {
		const runner: IErrorReportingSelfTestRunner = async () => ({
			ok: false,
			checks: [
				{ id: 'report-store-writable', ok: false, detail: 'read-only' },
			],
		});
		const section = await createErrorReportingSelfTestCheck(
			async () => runner,
		).run({ offline: false });
		expect(section.status).toBe('error');
		expect(section.findings).toEqual([
			'failed: report-store-writable (read-only)',
		]);
	});

	it('reports a warning, not a pass, when the plugin cannot be loaded', async () => {
		const section = await createErrorReportingSelfTestCheck(
			async () => undefined,
		).run({ offline: false });
		expect(section.status).toBe('warn');
		expect(section.findings[0]).toMatch(/^skipped:/);
	});

	it('turns a self-test that throws into an error section', async () => {
		const runner: IErrorReportingSelfTestRunner = async () => {
			throw new Error('boom');
		};
		const section = await createErrorReportingSelfTestCheck(
			async () => runner,
		).run({ offline: false });
		expect(section.status).toBe('error');
	});
});
