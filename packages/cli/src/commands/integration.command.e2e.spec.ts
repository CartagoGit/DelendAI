import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IRehearsalCommandRunner } from '@delendai/integration/public';

import {
	commitUnderTest,
	createIntegrationCommand,
	integrationCommand,
} from './integration.command';

const ctx = fakePartial<ICliCommandContext>({ cwd: '/ws' });

describe('the integration command on disk', () => {
	it('[<500ms] plays a real-mode rehearsal from the project workflows, naming the project integration branch', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'integration-cmd-'));
		try {
			writeFileSync(
				join(dir, 'delendai.config.json'),
				'{"development":{"branches":{"integration":"develop","release":"main","namespacePrefix":"ns"}}}',
			);
			mkdirSync(join(dir, '.github/workflows'), { recursive: true });
			const ci =
				'name: CI\non:\n  push:\n    branches: [develop, main]\njobs:\n  a:\n    runs-on: x\n';
			writeFileSync(join(dir, '.github/workflows/ci.yml'), ci);
			writeFileSync(join(dir, '.github/workflows/codeql.yml'), ci);
			const run: IRehearsalCommandRunner = async (args) => {
				const line = args.join(' ');
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
			const result = await createIntegrationCommand(
				run,
				async () => 'under-test',
			).run(
				['rehearse', '--mode=real', '--scenarios=host-offline'],
				fakePartial<ICliCommandContext>({ cwd: dir }),
			);
			expect(result.error).toBeUndefined();
			expect(result.text).toContain('leftovers: none');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('[<500ms] names the commit under test from the checkout', async () => {
		expect(await commitUnderTest(__dirname, undefined)).toMatch(
			/^[0-9a-f]{40}$/u,
		);
	});
});

describe('the real gh runner', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('[<500ms] reports what a gh that refuses printed', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'integration-gh-'));
		try {
			writeFileSync(
				join(dir, 'gh'),
				'#!/bin/sh\ncat >/dev/null\necho refused >&2\nexit 1\n',
			);
			chmodSync(join(dir, 'gh'), 0o755);
			vi.stubEnv('PATH', dir);
			const result = await integrationCommand.run(['rehearse'], ctx);
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toContain('refused');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('[<500ms] reports a gh that is not installed', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'integration-gh-'));
		try {
			vi.stubEnv('PATH', dir);
			const result = await integrationCommand.run(['rehearse'], ctx);
			expect(result.code).toBe(EXIT_CODE.RUNTIME);
			expect(result.error).toContain('ENOENT');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
