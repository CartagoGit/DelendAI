import { describe, expect, it } from 'vitest';

import type { ISecretScanDeps } from '../../../src/lib/contracts/interfaces/secrets.interface';
import { runSecretScan } from '../../../src/lib/secrets/run-scan';

const AWS = 'AKIAIOSFODNN7EXAMPLE';

const FILES: Record<string, string> = {
	'src/config.ts': `const k = '${AWS}';`,
	'src/clean.ts': 'export const x = 1;',
	'tests/fixture.spec.ts': `const k = '${AWS}';`, // test path — skipped by default
	'image.png': `binary ${AWS}`, // non-text ext — skipped
	'README.md': 'no secrets here',
};

const deps = (list: readonly string[]): ISecretScanDeps => ({
	listFiles: async () => list,
	readFile: async (path) => FILES[path],
});

describe('runSecretScan', () => {
	it('scans text non-test files and finds the planted secret', async () => {
		const out = await runSecretScan(deps(Object.keys(FILES)), {
			scope: 'tracked',
			includeTests: false,
		});
		expect(out.scanned).toBe(3); // config.ts, clean.ts, README.md
		expect(out.findings.some((f) => f.ruleId === 'aws-access-key-id')).toBe(
			true,
		);
		expect(
			out.findings.every(
				(f) => !(f.location?.file ?? '').includes('spec'),
			),
		).toBe(true);
	});

	it('includes test/fixture files when includeTests is true', async () => {
		const out = await runSecretScan(deps(Object.keys(FILES)), {
			scope: 'tracked',
			includeTests: true,
		});
		expect(out.scanned).toBe(4); // + the spec
		expect(
			out.findings.filter((f) => f.ruleId === 'aws-access-key-id'),
		).toHaveLength(2);
	});

	it('respects the maxFiles cap', async () => {
		const out = await runSecretScan(deps(Object.keys(FILES)), {
			scope: 'tracked',
			includeTests: true,
			maxFiles: 1,
		});
		expect(out.scanned).toBeLessThanOrEqual(1);
	});
});
