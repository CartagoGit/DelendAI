import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	downloadJobLogs,
	extractCommand,
	extractStepDetails,
	reproStepFromGh,
	defaultRunner,
	normalizeRunId,
	type GhRunner,
	type IGitHubRepo,
} from './local-repro.script';
import { pickLatestFailedRun, resolveDemoRun } from './local-repro.demo.script';

const REPO: IGitHubRepo = { owner: 'CartagoGit', repo: 'mcp-vertex' };
const GH_LOG =
	'quality\tTest\t2026-08-29T00:00:00.000Z ##[group]Run bun run test\nquality\tTest\t2026-08-29T00:00:00.000Z working-directory: packages/core\n';
const ghFixture: GhRunner = (args) =>
	(args[1] ?? '').endsWith('/logs')
		? { status: 0, stdout: GH_LOG, stderr: '' }
		: { status: 1, stdout: '', stderr: 'unexpected fixture call' };

describe('local-repro real CI coverage', () => {
	it('accepts either a numeric run id or a GitHub Actions run URL', () => {
		expect(normalizeRunId('33281963947')).toBe('33281963947');
		expect(
			normalizeRunId(
				'https://github.com/CartagoGit/mcp-vertex/actions/runs/33281963947',
			),
		).toBe('33281963947');
		expect(normalizeRunId('not-a-run')).toBeNull();
	});

	it('extracts the top-level command from a real gh log-failed step format', () => {
		const logs = [
			'quality-gate\tRun integrated quality gate\t2026-08-29T16:51:08.4698399Z ##[group]Run bun tools/scripts/ci/quality-gate.script.ts --real',
			'quality-gate\tRun integrated quality gate\t2026-08-29T16:51:08.4698938Z \u001b[36;1mbun tools/scripts/ci/quality-gate.script.ts --real\u001b[0m',
			'quality-gate\tRun integrated quality gate\t2026-08-29T16:51:08.4736213Z shell: /usr/bin/bash -e {0}',
			'quality-gate\tRun integrated quality gate\t2026-08-29T16:51:08.5051175Z quality-gate: 11 step(s), mode=real',
		].join('\n');

		expect(extractCommand(logs, 'Run integrated quality gate')).toBe(
			'bun tools/scripts/ci/quality-gate.script.ts --real',
		);
	});

	it('falls back to the final grouped Run block when the failed step name is absent from the raw job log', () => {
		const logs = [
			'2026-08-29T23:51:55.8188135Z ##[group]Run bun install --frozen-lockfile',
			'2026-08-29T23:51:55.8188914Z bun install --frozen-lockfile',
			'2026-08-29T23:51:55.8246509Z shell: /usr/bin/bash -e {0}',
			'2026-08-29T23:51:55.8247021Z ##[endgroup]',
			'2026-08-29T23:51:59.3767257Z ##[group]Run bun tools/scripts/ci/quality-gate.script.ts --real',
			'2026-08-29T23:51:59.3768000Z bun tools/scripts/ci/quality-gate.script.ts --real',
			'2026-08-29T23:51:59.4027385Z shell: /usr/bin/bash -e {0}',
			'2026-08-29T23:57:19.3614041Z ##[error]Process completed with exit code 1.',
		].join('\n');

		expect(extractStepDetails(logs, 'Run integrated quality gate')).toEqual(
			{
				command: 'bun tools/scripts/ci/quality-gate.script.ts --real',
				workingDirectory: '.',
			},
		);
	});

	it('falls back to gh run view when the REST log endpoint is forbidden', async () => {
		const ghRunner: GhRunner = () => ({
			status: 0,
			stdout: 'quality-gate    Run integrated quality gate     2026-08-29T16:51:08.4698938Z bun tools/scripts/ci/quality-gate.script.ts --real\n',
			stderr: '',
		});
		const fetcher = async (
			_input: string | URL | Request,
			_init?: RequestInit,
		) =>
			new Response(
				JSON.stringify({
					message: 'Must have admin rights to Repository.',
				}),
				{ status: 403 },
			);

		const logs = await downloadJobLogs(
			REPO,
			99130845382,
			null,
			fetcher as unknown as typeof fetch,
			ghRunner,
		);
		expect(logs).toContain('quality-gate');
		expect(logs).toContain('quality-gate.script.ts --real');
	});

	it('demo auto-selects the first recent failed run from gh output', () => {
		const selection = pickLatestFailedRun(
			JSON.stringify([
				{ databaseId: 100, conclusion: 'success', name: 'affected' },
				{
					databaseId: 200,
					conclusion: 'failure',
					name: 'quality-gate',
					url: 'https://github.com/CartagoGit/mcp-vertex/actions/runs/200',
				},
			]),
		);

		expect(selection).toEqual({
			runId: '200',
			source: 'gh',
			name: 'quality-gate',
			url: 'https://github.com/CartagoGit/mcp-vertex/actions/runs/200',
		});
	});

	it('demo honours an explicit run id before consulting gh', () => {
		const selection = resolveDemoRun(['33264054564'], () => {
			throw new Error(
				'gh should not be called when argv includes a run id',
			);
		});
		expect(selection).toEqual({ runId: '33264054564', source: 'argv' });
	});

	it('demo falls back to the documented real failed run when gh cannot list runs', () => {
		const selection = resolveDemoRun([], () => ({
			status: 1,
			stdout: '',
			stderr: 'gh unavailable',
		}));
		expect(selection).toEqual({
			runId: '33281963947',
			source: 'fixture',
			name: 'quality-gate',
			url: 'https://github.com/CartagoGit/mcp-vertex/actions/runs/33281963947',
		});
	});

	it('extracts the working directory and writes a deterministic run log with a diff summary', async () => {
		const details = extractStepDetails(
			[
				'quality-gate\tRun integrated quality gate\t2026-08-29T16:51:08.4698399Z ##[group]Run bun tools/scripts/ci/quality-gate.script.ts --real',
				'quality-gate\tRun integrated quality gate\t2026-08-29T16:51:08.4700000Z working-directory: tools',
			].join('\n'),
			'Run integrated quality gate',
		);
		expect(details).toEqual({
			command: 'bun tools/scripts/ci/quality-gate.script.ts --real',
			workingDirectory: 'tools',
		});

		const output = mkdtempSync(join(tmpdir(), 'local-repro-gh-'));
		try {
			const report = await reproStepFromGh(
				REPO,
				'123',
				{
					jobId: 42,
					jobName: 'quality',
					stepName: 'Test',
					stepNumber: 2,
				},
				async () => ({
					status: 1,
					stdout: 'FAIL expected failure\n',
					stderr: '',
				}),
				output,
				ghFixture,
			);
			expect(report.localLogPath).toBe(
				join(output, 'local-repro-123.log'),
			);
			expect(report.diffSummary).toMatch(/^diff: /);
		} finally {
			rmSync(output, { recursive: true, force: true });
		}
	});

	it('refuses shell operators before spawning a command', async () => {
		await expect(
			defaultRunner('bun run test && touch unsafe', process.cwd()),
		).rejects.toThrow(/refusing command containing shell operators/);
	});
});
