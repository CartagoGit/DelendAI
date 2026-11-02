import { describe, expect, it } from 'vitest';

import { compileRulePattern, SAST_RULES } from './rules';

describe('SAST_RULES', () => {
	it('matches the sql injection sample', () => {
		expect(
			compileRulePattern(SAST_RULES[0]!).test(
				'db.query(`select * from users where id = ${userId}`)',
			),
		).toBe(true);
	});

	it('matches the hardcoded secret sample', () => {
		expect(
			compileRulePattern(SAST_RULES[1]!).test(
				'const token = "abcd1234efgh5678ijkl"',
			),
		).toBe(true);
	});

	it('matches the unsafe deserialize sample', () => {
		expect(
			compileRulePattern(SAST_RULES[2]!).test(
				'payload = yaml.load(body)',
			),
		).toBe(true);
	});

	it('matches the dangerous eval sample', () => {
		expect(compileRulePattern(SAST_RULES[3]!).test('eval(userInput)')).toBe(
			true,
		);
	});
});
