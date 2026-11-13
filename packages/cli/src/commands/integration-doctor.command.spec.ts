import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';
import type { IRehearsalCommandRunner } from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

import { runIntegrationDoctor } from './integration-doctor.command';

const gh =
	(
		secrets: string,
		installation: string | undefined,
	): IRehearsalCommandRunner =>
	async (args) => {
		const line = args.join(' ');
		if (line.startsWith('repo view'))
			return { exitCode: 0, stdout: 'o/proj\n', stderr: '' };
		if (line.startsWith('secret list'))
			return { exitCode: 0, stdout: secrets, stderr: '' };
		if (line.startsWith('variable list'))
			return { exitCode: 0, stdout: 'DELENDAI_APP_ID\n', stderr: '' };
		return installation === undefined
			? { exitCode: 1, stdout: '', stderr: 'no' }
			: { exitCode: 0, stdout: installation, stderr: '' };
	};

const withDir = async (
	run: (ctx: ICliCommandContext) => Promise<void>,
): Promise<void> => {
	const dir = mkdtempSync(join(tmpdir(), 'integration-doctor-'));
	try {
		writeFileSync(join(dir, 'delendai.config.json'), '{}');
		await run(fakePartial<ICliCommandContext>({ cwd: dir }));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

describe('integration doctor', () => {
	it('[<200ms] prints the manifest alone for --manifest, with no forge read beyond the name', async () => {
		await withDir(async (ctx) => {
			const result = await runIntegrationDoctor(
				['--manifest'],
				ctx,
				gh('', undefined),
			);
			expect(result.code).toBe(EXIT_CODE.OK);
			expect(result.text).toContain('"name": "proj-integrator"');
			expect(result.text).toContain('"workflows": "write"');
		});
	});

	it('[<200ms] is red with the manifest while the key is missing', async () => {
		await withDir(async (ctx) => {
			const result = await runIntegrationDoctor(
				[],
				ctx,
				gh('', undefined),
			);
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.text).toContain(
				'FAIL secret DELENDAI_APP_PRIVATE_KEY',
			);
			expect(result.text).toContain('App manifest');
		});
	});

	it('[<200ms] is green with the id, the key and the permissions', async () => {
		await withDir(async (ctx) => {
			const result = await runIntegrationDoctor(
				[],
				ctx,
				gh(
					'DELENDAI_APP_PRIVATE_KEY\n',
					'{"contents":"write","pull_requests":"write","issues":"write","actions":"write","workflows":"write","checks":"read"}',
				),
			);
			expect(result.code).toBe(EXIT_CODE.OK);
			expect(result.text).toContain('doctor: green');
		});
	});

	it('[<200ms] names the failure when gh cannot name the repository', async () => {
		await withDir(async (ctx) => {
			const result = await runIntegrationDoctor([], ctx, async () => ({
				exitCode: 1,
				stdout: '',
				stderr: 'not signed in',
			}));
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toContain('not signed in');
		});
	});
});
