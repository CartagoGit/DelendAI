import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { INTEGRATION_COMMAND } from '../contracts/constants/integration-command.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IRehearsalCommandRunner } from '@delendai/integration/public';

import {
	createIntegrationCommand,
	integrationCommand,
} from './integration.command';

const ctx = fakePartial<ICliCommandContext>({
	cwd: '/ws',
	globals: {
		workspace: '/ws',
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
});

describe('the integration command', () => {
	it('[<50ms] refuses a subcommand it does not have, with its usage', async () => {
		const result = await integrationCommand.run(['pause'], ctx);
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(result.error).toContain('integration rehearse');
	});

	it('[<50ms] refuses a mode it does not run', async () => {
		const result = await integrationCommand.run(
			['rehearse', '--mode=slow'],
			ctx,
		);
		expect(result.code).toBe(EXIT_CODE.USAGE);
	});

	it('[<50ms] declares the flags it reads and runs without a server', () => {
		expect(integrationCommand.flags).toEqual(INTEGRATION_COMMAND.flags);
		expect(integrationCommand.offline).toBe(true);
	});

	it('[<200ms] rehearses one scenario through gh, leaves nothing and reports it red', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'integration-cmd-'));
		try {
			writeFileSync(
				join(dir, 'delendai.config.json'),
				'{"development":{"branches":{"integration":"develop","release":"main","namespacePrefix":"ns"}}}',
			);
			const calls: string[] = [];
			const run: IRehearsalCommandRunner = async (args) => {
				const line = args.join(' ');
				calls.push(line);
				if (line.startsWith('repo view'))
					return { exitCode: 0, stdout: 'o/r\n', stderr: '' };
				if (line.includes('git/ref/heads/develop'))
					return {
						exitCode: 0,
						stdout: '{"object":{"sha":"tip"}}',
						stderr: '',
					};
				if (line.includes('actions/runs'))
					return {
						exitCode: 0,
						stdout: '{"workflow_runs":[]}',
						stderr: '',
					};
				if (/--method (POST|PUT|PATCH)/u.test(line))
					return {
						exitCode: 0,
						stdout: '{"sha":"x","tree":{"sha":"t"},"number":1}',
						stderr: '',
					};
				return { exitCode: 0, stdout: '[]', stderr: '' };
			};
			const asked: (string | undefined)[] = [];
			const result = await createIntegrationCommand(
				run,
				async (_cwd, base) => {
					asked.push(base);
					return 'under-test';
				},
			).run(
				['rehearse', '--scenarios=host-offline', '--base=feature-sha'],
				fakePartial<ICliCommandContext>({ cwd: dir }),
			);
			// With nothing played the targets have no data, so the run is red, never green by absence.
			expect(asked).toEqual(['feature-sha']);
			expect(calls.some((c) => c.includes('sha=under-test'))).toBe(true);
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toBeUndefined();
			expect(result.text).toContain('RED');
			expect(result.text).toContain('leftovers: none');
			const writes = calls.filter((c) =>
				/--method (POST|PUT|PATCH|DELETE)/u.test(c),
			);
			expect(writes.every((c) => c.includes('rehearsal'))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('[<50ms] refuses a scenario id the catalogue does not have', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'integration-cmd-'));
		try {
			writeFileSync(join(dir, 'delendai.config.json'), '{}');
			const run: IRehearsalCommandRunner = async (args) =>
				args[0] === 'repo'
					? { exitCode: 0, stdout: 'o/r', stderr: '' }
					: {
							exitCode: 0,
							stdout: '{"object":{"sha":"t"}}',
							stderr: '',
						};
			const result = await createIntegrationCommand(
				run,
				async () => 'under-test',
			).run(
				['rehearse', '--scenarios=nope'],
				fakePartial<ICliCommandContext>({ cwd: dir }),
			);
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toContain('unknown scenario');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('[<50ms] says what gh answered when it cannot name the repository', async () => {
		const run: IRehearsalCommandRunner = async () => ({
			exitCode: 1,
			stdout: '',
			stderr: 'not logged in',
		});
		const result = await createIntegrationCommand(
			run,
			async () => 'under-test',
		).run(
			['rehearse'],
			fakePartial<ICliCommandContext>({ cwd: '/nowhere' }),
		);
		expect(result.code).toBe(EXIT_CODE.RUNTIME);
		expect(result.error).toContain('not logged in');
	});
});
