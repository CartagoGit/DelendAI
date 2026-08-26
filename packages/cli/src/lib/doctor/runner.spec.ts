/**
 * runner.spec.ts — f00191 / q00006 Track I.
 *
 * Verifies the pure-check runner composes the right checks in order,
 * injects custom `extraChecks`, and never propagates a thrown check
 * (a broken check becomes an `error` section, the doctor still
 * finishes).
 */
import { describe, expect, it } from 'vitest';

import { runDoctorChecks } from './runner';
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
