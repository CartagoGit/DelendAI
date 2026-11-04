import { describe, expect, it } from 'vitest';

import { findCleartextSecrets } from './no-cleartext-secrets.script';

const paths = (v: unknown) =>
	findCleartextSecrets(v, 'x.config.json').map((f) => f.path);

describe('findCleartextSecrets (f00067 S8)', () => {
	it('flags a cleartext secret-ish field', () => {
		expect(paths({ apiKey: 'sk-ant-real-value-123456' })).toEqual([
			'apiKey',
		]);
		expect(paths({ clientSecret: 'hunter2hunter2' })).toEqual([
			'clientSecret',
		]);
		expect(paths({ password: 'p4ssw0rd-literal' })).toEqual(['password']);
		expect(paths({ access_key: 'AKIA-not-really' })).toEqual([
			'access_key',
		]);
	});

	it('allows ${ENV_VAR} references and bare ENV_VAR names', () => {
		expect(paths({ apiKey: '${OPENAI_API_KEY}' })).toEqual([]);
		expect(paths({ apiKey: 'OPENAI_API_KEY' })).toEqual([]);
		expect(paths({ token: '' })).toEqual([]);
	});

	it('does NOT flag non-secret keys that merely contain a secret word', () => {
		// End-anchored match: none of these END in a secret word.
		expect(
			paths({
				keywords: ['a', 'b'],
				maxTokens: 4096,
				tokenBudget: 1200,
				keyboardLayout: 'qwerty',
			}),
		).toEqual([]);
	});

	it('walks nested objects and arrays', () => {
		const cfg = {
			plugins: {
				svc: { options: { apiKey: 'sk-literal-abcdefgh' } },
			},
			providers: [
				{ id: 'a', invoke: { envVar: 'X_API_KEY' } }, // envVar name → safe
				{ id: 'b', secret: 'literal-secret-value' },
			],
		};
		expect(paths(cfg)).toEqual([
			'plugins.svc.options.apiKey',
			'providers[1].secret',
		]);
	});

	it('ignores non-string secret-ish values (numbers, objects, null)', () => {
		expect(
			paths({ token: 123, secret: null, apiKey: { ref: 'x' } }),
		).toEqual([]);
	});
});
