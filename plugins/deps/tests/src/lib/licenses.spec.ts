import { describe, expect, it } from 'vitest';

import type { ILicenseScanDeps } from '../../../src/lib/contracts/interfaces/licenses.interface';
import {
	classifyLicense,
	realLicenseDeps,
	scanLicenses,
} from '../../../src/lib/services/licenses';

describe('classifyLicense', () => {
	it('does not flag permissive licenses', () => {
		for (const lic of [
			'MIT',
			'BSD-3-Clause',
			'Apache-2.0',
			'ISC',
			'0BSD',
		]) {
			expect(classifyLicense(lic)).toBeUndefined();
		}
	});

	it('flags strong copyleft as high', () => {
		expect(classifyLicense('GPL-3.0')?.severity).toBe('high');
		expect(classifyLicense('AGPL-3.0')?.severity).toBe('high');
	});

	it('flags weak copyleft as medium', () => {
		expect(classifyLicense('LGPL-3.0')?.severity).toBe('medium');
		expect(classifyLicense('MPL-2.0')?.severity).toBe('medium');
	});

	it('flags proprietary + missing + unknown', () => {
		expect(classifyLicense('UNLICENSED')?.severity).toBe('high');
		expect(classifyLicense(undefined)?.label).toContain('missing');
		expect(classifyLicense('SEE LICENSE IN FILE')?.severity).toBe('low');
	});
});

describe('scanLicenses', () => {
	it('emits findings only for dependencies worth review', async () => {
		const licenses: Record<string, string | undefined> = {
			'pkg-mit': 'MIT',
			'pkg-gpl': 'GPL-3.0',
			'pkg-lgpl': 'LGPL-3.0',
			'pkg-none': undefined,
		};
		const deps: ILicenseScanDeps = {
			listDependencyNames: async () => Object.keys(licenses),
			readLicense: async (name) => licenses[name],
		};
		const findings = await scanLicenses(deps);
		const byRule = findings.map((f) => f.ruleId).sort();
		expect(byRule).toEqual([
			'license:pkg-gpl',
			'license:pkg-lgpl',
			'license:pkg-none',
		]);
		expect(
			findings.find((f) => f.ruleId === 'license:pkg-gpl')?.severity,
		).toBe('high');
		// the permissive MIT dep is not flagged
		expect(findings.some((f) => f.ruleId === 'license:pkg-mit')).toBe(
			false,
		);
	});
});

describe('an unreadable scan', () => {
	it('fails when the manifest cannot be read', async () => {
		await expect(
			scanLicenses(realLicenseDeps('/nowhere-to-read', 'package.json')),
		).rejects.toThrow();
	});

	it('fails when no dependency can be read', async () => {
		await expect(
			scanLicenses({
				listDependencyNames: async () => ['a', 'b'],
				readLicense: async () => {
					throw new Error('ENOENT');
				},
			}),
		).rejects.toThrow('no installed dependency');
	});

	it('reports one unreadable dependency as a missing licence', async () => {
		const findings = await scanLicenses({
			listDependencyNames: async () => ['a', 'b'],
			readLicense: async (name) => {
				if (name === 'a') throw new Error('ENOENT');
				return 'MIT';
			},
		});
		expect(findings.map((finding) => finding.ruleId)).toEqual([
			'license:a',
		]);
	});
});
