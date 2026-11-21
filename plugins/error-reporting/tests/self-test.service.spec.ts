import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IIssueExecResult } from '../src/lib/contracts/interfaces/reporter.interface';
import { runErrorReportingSelfTest } from '../src/lib/self-test.service';
import {
	registerInternalRuntimePaths,
	resetInternalPathRegistry,
} from '../src/lib/signature.helper';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-self-test-'));
	tmpDirs.push(dir);
	return dir;
};

afterEach(async () => {
	resetInternalPathRegistry();
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const ok = (stdout = ''): IIssueExecResult => ({
	ok: true,
	code: 0,
	stdout,
	stderr: '',
});

const fail = (code: number, stderr = ''): IIssueExecResult => ({
	ok: false,
	code,
	stdout: '',
	stderr,
});

describe('runErrorReportingSelfTest', () => {
	it('passes every local check with no gh involved when live is omitted', async () => {
		const exec = vi.fn();
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			exec,
		});
		expect(result.ok).toBe(true);
		expect(exec).not.toHaveBeenCalled();
		const byId = Object.fromEntries(
			result.checks.map((check) => [check.id, check]),
		);
		expect(byId['plugin-loaded']?.ok).toBe(true);
		expect(byId['hook-registered']?.ok).toBe(true);
		expect(byId['synthetic-failure-observed']?.ok).toBe(true);
		expect(byId['classification-pipeline-working']?.ok).toBe(true);
		expect(byId['privacy-validation-working']?.ok).toBe(true);
		expect(byId['report-store-writable']?.ok).toBe(true);
		expect(byId['gh-installed']?.skipped).toBe(true);
	});

	it('never calls the exec seam with `gh issue create`, live or not', async () => {
		const exec = vi.fn().mockResolvedValue(ok());
		await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			live: true,
			exec,
		});
		for (const call of exec.mock.calls) {
			const argv = call[0] as readonly string[];
			expect(argv[0] === 'issue' && argv[1] === 'create').toBe(false);
		}
	});

	it('detects a missing gh binary when live', async () => {
		const exec = vi.fn().mockResolvedValue(fail(127, 'command not found'));
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			live: true,
			exec,
		});
		expect(result.ok).toBe(false);
		const ghInstalled = result.checks.find(
			(check) => check.id === 'gh-installed',
		);
		expect(ghInstalled?.ok).toBe(false);
	});

	it('detects an unauthenticated gh session when live', async () => {
		const exec = vi
			.fn()
			.mockResolvedValueOnce(ok('gh version 2.4.0'))
			.mockResolvedValue(fail(1, 'not logged in'));
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			live: true,
			exec,
		});
		const authenticated = result.checks.find(
			(check) => check.id === 'gh-authenticated',
		);
		expect(authenticated?.ok).toBe(false);
		expect(result.ok).toBe(false);
	});

	it('detects an unreachable target repo when live', async () => {
		const exec = vi
			.fn()
			.mockResolvedValueOnce(ok('gh version 2.4.0'))
			.mockResolvedValueOnce(ok('logged in'))
			.mockResolvedValue(fail(1, 'HTTP 404'));
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			live: true,
			exec,
		});
		const reachable = result.checks.find(
			(check) => check.id === 'target-repo-reachable',
		);
		expect(reachable?.ok).toBe(false);
	});

	it('detects missing issue-create permission when live', async () => {
		const exec = vi
			.fn()
			.mockResolvedValueOnce(ok('gh version 2.4.0'))
			.mockResolvedValueOnce(ok('logged in'))
			.mockResolvedValueOnce(ok('{"name":"delendai"}'))
			.mockResolvedValueOnce(ok('false'));
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			live: true,
			exec,
		});
		const permission = result.checks.find(
			(check) => check.id === 'issue-create-permission-available',
		);
		expect(permission?.ok).toBe(false);
		expect(result.ok).toBe(false);
	});

	it('passes all four gh checks live when gh behaves', async () => {
		const exec = vi
			.fn()
			.mockResolvedValueOnce(ok('gh version 2.4.0'))
			.mockResolvedValueOnce(ok('logged in'))
			.mockResolvedValueOnce(ok('{"name":"delendai"}'))
			.mockResolvedValueOnce(ok('true'));
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
			live: true,
			exec,
		});
		expect(result.ok).toBe(true);
	});

	it('reports report-store-writable as failing when a path segment is a file, not a directory', async () => {
		const { writeFile } = await import('node:fs/promises');
		const dir = await makeDir();
		const blockerFile = join(dir, 'blocker');
		await writeFile(blockerFile, 'not a directory');
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			// `blockerFile` is a regular file, so mkdir -p underneath it
			// must fail with ENOTDIR — proves the check surfaces a real
			// write failure instead of always reporting ok.
			probeDirAbs: join(blockerFile, 'unreachable'),
			targetRepo: 'CartagoGit/delendai',
		});
		const writable = result.checks.find(
			(check) => check.id === 'report-store-writable',
		);
		expect(writable?.ok).toBe(false);
		expect(result.ok).toBe(false);
	});

	it('is unaffected by whatever internal-path registry the host process already has', async () => {
		registerInternalRuntimePaths(import.meta.url);
		const result = await runErrorReportingSelfTest({
			reportObservedFailure: async () => {},
			probeDirAbs: await makeDir(),
			targetRepo: 'CartagoGit/delendai',
		});
		expect(
			result.checks.find((c) => c.id === 'synthetic-failure-observed')
				?.ok,
		).toBe(true);
	});
});
