import { describe, expect, it } from 'vitest';

import { parseSastJson } from './parsers';

describe('parseSastJson', () => {
	it('maps semgrep json into findings', () => {
		const findings = parseSastJson(
			{
				results: [
					{
						check_id: 'sql-injection',
						path: 'src/db.ts',
						start: { line: 4 },
						end: { line: 4 },
						extra: {
							severity: 'ERROR',
							message: 'Potential SQL injection',
						},
					},
				],
			},
			{ source: 'semgrep' },
		);
		expect(findings).toEqual([
			{
				ruleId: 'sql-injection',
				severity: 'critical',
				message: 'Potential SQL injection',
				location: { file: 'src/db.ts', line: 4, endLine: 4 },
			},
		]);
	});

	it('maps ast-grep json into findings', () => {
		const findings = parseSastJson(
			[
				{
					id: 'dangerous-eval',
					file: 'src/eval.js',
					start: { line: 2 },
					end: { line: 2 },
					severity: 'medium',
					message: 'Avoid eval',
				},
			],
			{ source: 'ast-grep' },
		);
		expect(findings[0]).toMatchObject({
			ruleId: 'dangerous-eval',
			severity: 'medium',
			location: { file: 'src/eval.js', line: 2, endLine: 2 },
		});
	});

	it('maps fallback json into findings', () => {
		const findings = parseSastJson(
			{
				results: [
					{
						ruleId: 'hardcoded-secret',
						severity: 'high',
						message: 'Potential hardcoded secret',
						file: 'src/config.ts',
						location: { line: 8 },
					},
				],
			},
			{ source: 'fallback' },
		);
		expect(findings).toEqual([
			{
				ruleId: 'hardcoded-secret',
				severity: 'high',
				message: 'Potential hardcoded secret',
				location: { file: 'src/config.ts', line: 8 },
			},
		]);
	});
});
