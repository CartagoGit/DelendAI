import { describe, expect, it } from 'vitest';

import { verifySecurityGate } from '../../../../../../tools/scripts/verify/security.script.ts';

describe('verifySecurityGate', () => {
	it('passes when every critical already exists in the baseline', async () => {
		const result = await verifySecurityGate('/repo', {
			readBaseline: async () =>
				JSON.stringify({
					criticals: [
						'sql-injection::src/db.ts::3::Potential SQL injection',
					],
				}),
			runSecrets: async () => [],
			runDeps: async () => [],
			runSast: async () => [
				{
					ruleId: 'sql-injection',
					severity: 'critical',
					message: 'Potential SQL injection',
					location: { file: 'src/db.ts', line: 3 },
				},
			],
		});
		expect(result.ok).toBe(true);
		expect(result.newCriticals).toEqual([]);
	});

	it('fails when a new critical appears', async () => {
		const result = await verifySecurityGate('/repo', {
			readBaseline: async () => JSON.stringify({ criticals: [] }),
			runSecrets: async () => [
				{
					ruleId: 'private-key',
					severity: 'critical',
					message: 'Secret leaked',
					location: { file: '.env', line: 1 },
				},
			],
			runDeps: async () => [],
			runSast: async () => [],
		});
		expect(result.ok).toBe(false);
		expect(result.newCriticals).toHaveLength(1);
	});

	it('skips the gate when the baseline is missing', async () => {
		const result = await verifySecurityGate('/repo', {
			readBaseline: async () => undefined,
			runSecrets: async () => [],
			runDeps: async () => [],
			runSast: async () => [],
		});
		expect(result.ok).toBe(true);
		expect(result.skipped).toBe(true);
	});
});
