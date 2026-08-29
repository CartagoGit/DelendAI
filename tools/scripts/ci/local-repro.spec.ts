import { describe, expect, it } from 'vitest';

import {
	downloadJobLogs,
	extractCommand,
	type GhRunner,
	type IGitHubRepo,
} from './local-repro.script';
import { pickLatestFailedRun, resolveDemoRun } from './local-repro.demo.script';

const REPO: IGitHubRepo = { owner: 'CartagoGit', repo: 'mcp-vertex' };

describe('local-repro real CI coverage', () => {
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

	it('falls back to gh run view when the REST log endpoint is forbidden', async () => {
		const ghRunner: GhRunner = () => ({
			status: 0,
			stdout: 'quality-gate    Run integrated quality gate     2026-08-29T16:51:08.4698938Z bun tools/scripts/ci/quality-gate.script.ts --real\n',
			stderr: '',
		});
		const fetcher: typeof fetch = async (
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
			fetcher,
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
});
