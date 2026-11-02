/**
 * redact-key-shapes.spec.ts — every common key shape is redacted by the
 * one rule set, and the Google rule takes exactly its own length.
 *
 * The keys are assembled at run time: written whole, the commit hook would
 * replace them with placeholders.
 */
import { describe, expect, it } from 'vitest';

import { SECRET_RULES } from '@delendai/contracts';

import { redactSecrets } from '../../../../src/lib/shared/redact';

const body = (length: number): string =>
	'aB3dE5gH7jK9mN1pQ2sT4vW6xY8zA0cF'.repeat(4).slice(0, length);

const KEYS: Readonly<Record<string, string>> = {
	openai: ['sk-', body(48)].join(''),
	'openai project': [
		'sk-',
		'proj-',
		body(20),
		'_',
		body(20),
		'-',
		body(10),
	].join(''),
	anthropic: ['sk-', 'ant-', 'api03-', body(40)].join(''),
	openrouter: ['sk-', 'or-', 'v1-', body(40)].join(''),
	github: ['gh', 'p_', body(36)].join(''),
	'github fine-grained': ['github_', 'pat_', body(22), '_', body(30)].join(
		'',
	),
	gitlab: ['gl', 'pat-', body(20)].join(''),
	aws: ['AK', 'IA', 'Q'.repeat(16)].join(''),
	google: ['AI', 'za', body(35)].join(''),
	slack: ['xo', 'xb-', body(24)].join(''),
	stripe: ['sk', '_live_', body(24)].join(''),
	'slack webhook': [
		'https://hooks.',
		'slack.com/services/',
		body(9),
		'/',
		body(24),
	].join(''),
};

describe('one secret rule set', () => {
	it.each(Object.entries(KEYS))('redacts a %s key', (_name, key) => {
		const { text, redactions } = redactSecrets(`value ${key} end`);
		expect(text).not.toContain(key);
		expect(redactions).toBeGreaterThan(0);
	});

	it('takes a Google key at exactly its length, not a longer random string', () => {
		const rule = SECRET_RULES.find(
			(each) => each.name === 'google-api-key',
		);
		const exact = ['AI', 'za', body(35)].join('');
		const longer = ['AI', 'za', body(40)].join('');
		expect(rule?.re.test(exact)).toBe(true);
		if (rule !== undefined) rule.re.lastIndex = 0;
		expect(rule?.re.test(longer)).toBe(false);
	});
});
