import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	repoRoot,
	verifySecurityGate,
} from '../../../../../../tools/scripts/verify/security.script.ts';

const git = (cwd: string, ...args: string[]): void => {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
};

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

	it('fails, with the cause, when the baseline is missing', async () => {
		const result = await verifySecurityGate('/repo', {
			readBaseline: async () => undefined,
			runSecrets: async () => [],
			runDeps: async () => [],
			runSast: async () => [],
		});
		expect(result.ok).toBe(false);
		expect(result.failures.join('\n')).toContain('No baseline');
	});

	it('fails, with the cause, when a scanner could not run', async () => {
		// A dependency audit that did not run once read as zero
		// vulnerabilities.
		const result = await verifySecurityGate('/repo', {
			readBaseline: async () => JSON.stringify({ criticals: [] }),
			runSecrets: async () => [],
			runDeps: async () => {
				throw new Error('bun audit did not return readable JSON');
			},
			runSast: async () => [],
		});
		expect(result.ok).toBe(false);
		expect(result.failures).toEqual([
			'dependencies could not run: bun audit did not return readable JSON',
		]);
	});

	it('resolves the checkout as its root, not the tools folder', () => {
		expect(existsSync(join(repoRoot(), 'tools/scripts/verify'))).toBe(true);
	});

	it('fails on a key planted in a tracked file', async () => {
		const root = mkdtempSync(join(tmpdir(), 'security-gate-'));
		try {
			git(root, 'init', '-q');
			// Assembled at run time: the commit hook rewrites a literal one.
			const key = ['AKIA', 'Q'.repeat(16)].join('');
			writeFileSync(
				join(root, 'config.ts'),
				`export const id = '${key}';\n`,
			);
			git(root, 'add', 'config.ts');
			const result = await verifySecurityGate(root, {
				readBaseline: async () => JSON.stringify({ criticals: [] }),
				runDeps: async () => [],
				runSast: async () => [],
			});
			expect(result.ok).toBe(false);
			expect(
				result.newCriticals.map((finding) => finding.ruleId),
			).toEqual(['aws-access-key-id']);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
