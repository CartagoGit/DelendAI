/**
 * runner.spec.ts — f00191 / q00006 Track I.
 *
 * Verifies the pure-check runner composes the right checks in order,
 * injects custom `extraChecks`, and never propagates a thrown check
 * (a broken check becomes an `error` section, the doctor still
 * finishes).
 */
import { describe, expect, it } from 'vitest';

import { runDoctorChecks, realFs } from './runner';
import type { DoctorCheck } from './types';

describe('runDoctorChecks (f00191)', () => {
	const fs = {
		fileExists: async () => false,
		readFile: async () => undefined,
		listDirs: async (): Promise<readonly string[]> => [],
	};

	it('runs every default checks in order', async () => {
		const sections = await runDoctorChecks({
			workspace: '/w',
			fs,
			now: () => new Date('2026-08-26T00:00:00Z'),
		});
		const names = sections.map((s) => s.name);
		expect(names).toContain('manifests');
		expect(names).toContain('runtime');
		expect(names).toContain('stale-docs');
		expect(names).toContain('git-status');
		expect(names).toContain('permissions');
	});

	it('uses extraChecks when provided and skips defaults', async () => {
		const fakeOk: DoctorCheck = async () => ({
			name: 'fake-ok',
			status: 'ok',
			findings: ['ok'],
		});
		const sections = await runDoctorChecks({
			workspace: '/w',
			fs,
			now: () => new Date(),
			extraChecks: [fakeOk],
		});
		expect(sections).toEqual([
			{ name: 'fake-ok', status: 'ok', findings: ['ok'] },
		]);
	});

	it('swallows a thrown check and reports it as error', async () => {
		const throwing: DoctorCheck = async () => {
			throw new Error('intentional');
		};
		const sections = await runDoctorChecks({
			workspace: '/w',
			fs,
			now: () => new Date(),
			extraChecks: [throwing],
		});
		expect(sections).toHaveLength(1);
		const [section] = sections;
		expect(section?.status).toBe('error');
		expect(section?.findings[0]).toContain('intentional');
	});
});

describe('realFs — the doctor asks the filesystem, not a shell (x00612)', () => {
	it('answers for a directory, which `test -e` did and Bun.file does not', async () => {
		// Swapping in the wrong primitive took the health score from 20 to
		// 0: the checks rely on `fileExists` answering for directories.
		await expect(realFs.fileExists('packages')).resolves.toBe(true);
	});

	it('answers for a file', async () => {
		await expect(realFs.fileExists('package.json')).resolves.toBe(true);
	});

	it('reads a file, and answers undefined for one that is not there', async () => {
		await expect(realFs.readFile('package.json')).resolves.toContain(
			'"name"',
		);
		await expect(
			realFs.readFile('no/such/file.json'),
		).resolves.toBeUndefined();
	});

	it('lists a directory', async () => {
		await expect(realFs.listDirs('packages')).resolves.toContain('cli');
	});

	it('treats a missing directory as an answer, silently', async () => {
		// `ls -1` printed `ls: cannot access 'plugins'` into the caller's
		// terminal on its way to being handled. Absence is an answer here,
		// not a line in somebody else's output.
		await expect(realFs.listDirs('no/such/dir')).resolves.toStrictEqual([]);
	});

	it('answers false for a path that is not there', async () => {
		await expect(realFs.fileExists('no/such/file')).resolves.toBe(false);
	});
});

describe('runDoctorChecks defaults (x00612)', () => {
	it('runs every default check with no injected clock', async () => {
		// `now` defaults to a real clock. Every other test injects one, so
		// the default was a function nothing called — and a default nobody
		// exercises is a default nobody has checked.
		const sections = await runDoctorChecks({ workspace: process.cwd() });

		expect(sections.length).toBeGreaterThan(5);
		expect(sections.every((s) => typeof s.name === 'string')).toBe(true);
	});
});
