import { describe, expect, it } from 'vitest';

import { runSastRunner } from './runner';
import { SAST_RULES } from './rules';

const probeDeps = (available: Record<string, boolean>) => ({
	commandExists: async (bin: string) => available[bin] === true,
	runVersion: async () => '1.0.0',
});

describe('runSastRunner', () => {
	it('uses semgrep when available', async () => {
		const result = await runSastRunner({
			cwd: '/repo',
			rules: SAST_RULES,
			languages: ['typescript', 'generic'],
			files: ['src/db.ts'],
			probeDeps: probeDeps({ semgrep: true, 'ast-grep': false }),
			exec: async () => ({
				ok: true,
				code: 0,
				stdout: JSON.stringify({
					results: [
						{
							check_id: 'sql-injection',
							path: 'src/db.ts',
							start: { line: 3 },
							end: { line: 3 },
							extra: {
								severity: 'ERROR',
								message: 'Potential SQL injection',
							},
						},
					],
				}),
				stderr: '',
				timedOut: false,
				unavailable: false,
			}),
		});
		expect(result.source).toBe('semgrep');
		expect(result.findings).toHaveLength(1);
	});

	it('uses ast-grep when semgrep is unavailable', async () => {
		const result = await runSastRunner({
			cwd: '/repo',
			rules: SAST_RULES,
			languages: ['javascript', 'generic'],
			files: ['src/eval.js'],
			probeDeps: probeDeps({ semgrep: false, 'ast-grep': true }),
			exec: async () => ({
				ok: true,
				code: 0,
				stdout: JSON.stringify([
					{
						id: 'dangerous-eval',
						file: 'src/eval.js',
						start: { line: 2 },
						end: { line: 2 },
						severity: 'medium',
						message: 'Avoid eval',
					},
				]),
				stderr: '',
				timedOut: false,
				unavailable: false,
			}),
		});
		expect(result.source).toBe('ast-grep');
		expect(result.findings[0]?.ruleId).toBe('dangerous-eval');
	});

	it('falls back to inline regex matching when no CLI is available', async () => {
		const result = await runSastRunner({
			cwd: '/repo',
			rules: SAST_RULES,
			languages: ['python', 'generic'],
			files: ['app.py'],
			probeDeps: probeDeps({ semgrep: false, 'ast-grep': false }),
			readTextFile: async () => 'import yaml\nyaml.load(body)',
		});
		expect(result.source).toBe('fallback');
		expect(result.findings[0]?.ruleId).toBe('unsafe-deserialize');
	});
});
