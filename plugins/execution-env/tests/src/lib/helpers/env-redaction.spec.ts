import { describe, expect, it } from 'vitest';

import { redactEnvironment } from '../../../../src/lib/helpers/env-redaction.helper';

describe('redactEnvironment', () => {
	it('hides credential-looking names and keeps ordinary ones', () => {
		const shown = redactEnvironment({
			PATH: '/usr/bin',
			GITHUB_TOKEN: 'abc',
			db_password: 'hunter2',
			AWS_SECRET_ACCESS_KEY: 'xyz',
		});
		expect(shown).toEqual({
			PATH: '/usr/bin',
			GITHUB_TOKEN: '[redacted]',
			db_password: '[redacted]',
			AWS_SECRET_ACCESS_KEY: '[redacted]',
		});
	});

	it('shows an allowed name even when it looks secret', () => {
		expect(redactEnvironment({ SSH_AUTH_SOCK: '/tmp/agent.sock' })).toEqual(
			{ SSH_AUTH_SOCK: '/tmp/agent.sock' },
		);
	});

	it('drops variables that have no value', () => {
		expect(redactEnvironment({ A: undefined, B: 'b' })).toEqual({ B: 'b' });
	});

	it('uses the policy it is given', () => {
		const shown = redactEnvironment(
			{ NAME: 'n', OTHER: 'o' },
			{ secretNamePattern: /^NAME$/, allowNames: [], placeholder: '***' },
		);
		expect(shown).toEqual({ NAME: '***', OTHER: 'o' });
	});
});
