import { describe, expect, it } from 'vitest';

import { buildSafeEnv } from './env-filter';

describe('buildSafeEnv', () => {
	it('returns only defined base keys when entry.env is absent', () => {
		const result = buildSafeEnv({
			entry: {},
			hostEnv: {
				PATH: '/bin',
				HOME: '/home/x',
				TMPDIR: '/tmp/work',
				LANG: 'en_US.UTF-8',
				SECRET_DECOY: 'should-not-leak',
			},
		});

		expect(result).toEqual({
			ok: true,
			env: {
				PATH: '/bin',
				HOME: '/home/x',
				TMPDIR: '/tmp/work',
				LANG: 'en_US.UTF-8',
			},
		});
	});

	it('keeps base keys and declared literal entries', () => {
		const result = buildSafeEnv({
			entry: { env: { LOG_LEVEL: 'info' } },
			hostEnv: {
				PATH: '/bin',
				HOME: '/home/x',
			},
		});

		expect(result).toEqual({
			ok: true,
			env: {
				PATH: '/bin',
				HOME: '/home/x',
				LOG_LEVEL: 'info',
			},
		});
	});

	it('fails when a required host key is missing', () => {
		const result = buildSafeEnv({
			entry: {},
			hostEnv: {
				PATH: '/bin',
			},
			requiredKeys: ['FOO'],
		});

		expect(result).toEqual({
			ok: false,
			code: 'missing-env',
			missing: ['FOO'],
		});
	});

	it('omits missing optional host keys without failing', () => {
		const result = buildSafeEnv({
			entry: {},
			hostEnv: {
				PATH: '/bin',
			},
			optionalKeys: ['BAR'],
		});

		expect(result).toEqual({
			ok: true,
			env: {
				PATH: '/bin',
			},
		});
	});

	it('never leaks undeclared host env keys into the result', () => {
		const result = buildSafeEnv({
			entry: { env: { API_TOKEN: '$DECLARED_TOKEN', MODE: 'prod' } },
			hostEnv: {
				PATH: '/bin',
				DECLARED_TOKEN: 'declared-value',
				SECRET_DECOY: 'should-not-leak',
				XDG_RUNTIME_DIR: '/run/user/1000',
			},
		});

		expect(result).toEqual({
			ok: true,
			env: {
				PATH: '/bin',
				API_TOKEN: 'declared-value',
				MODE: 'prod',
			},
		});
	});
});
