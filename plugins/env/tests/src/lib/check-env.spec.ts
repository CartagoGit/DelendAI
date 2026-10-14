import { describe, expect, it } from 'vitest';

import {
	checkEnv,
	parseEnv,
	runEnvCheck,
} from '../../../src/lib/env/check-env';
import type { IEnvScanDeps } from '../../../src/lib/contracts/interfaces/env.interface';

const SAMPLE = [
	'# a comment',
	'',
	'export FOO=bar',
	'BAR=',
	'FOO=baz',
	'not an assignment',
	'BAZ="value"',
].join('\n');

describe('parseEnv', () => {
	it('parses assignments (with export) and flags malformed lines', () => {
		const parsed = parseEnv(SAMPLE);
		expect(parsed.entries.map((e) => e.key)).toEqual([
			'FOO',
			'BAR',
			'FOO',
			'BAZ',
		]);
		expect(parsed.entries.find((e) => e.key === 'BAR')?.empty).toBe(true);
		expect(parsed.malformedLines).toEqual([6]);
	});
});

describe('checkEnv', () => {
	it('flags duplicates, empties, malformed lines and missing required', () => {
		const findings = checkEnv(SAMPLE, ['FOO', 'MISSING']);
		const ids = findings.map((f) => f.ruleId);
		expect(ids).toContain('duplicate-key');
		expect(ids).toContain('empty-value');
		expect(ids).toContain('malformed-line');
		const missing = findings.find((f) => f.ruleId === 'missing-required');
		expect(missing?.severity).toBe('high');
		expect(missing?.message).toContain('MISSING');
	});

	it('never includes a value in a finding message', () => {
		const findings = checkEnv(
			'SECRET=super-secret-value\nSECRET=other',
			[],
		);
		for (const finding of findings) {
			expect(finding.message).not.toContain('super-secret-value');
			expect(finding.message).not.toContain('other');
		}
	});

	it('is clean for a well-formed file with all required present', () => {
		expect(checkEnv('A=1\nB=2', ['A', 'B'])).toEqual([]);
	});
});

describe('runEnvCheck', () => {
	it('reports found:false when the file does not exist', async () => {
		const deps: IEnvScanDeps = { readEnv: async () => undefined };
		expect(await runEnvCheck(deps, '.env')).toEqual({
			found: false,
			findings: [],
		});
	});

	it('checks the file when present', async () => {
		const deps: IEnvScanDeps = { readEnv: async () => 'A=\nA=1' };
		const result = await runEnvCheck(deps, '.env');
		expect(result.found).toBe(true);
		expect(result.findings.some((f) => f.ruleId === 'duplicate-key')).toBe(
			true,
		);
	});
});
