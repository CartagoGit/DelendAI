import { afterEach, describe, expect, it } from 'vitest';

import { BASE_ALLOW_LIST, buildSafeEnv } from './env-filter';

const SNAPSHOT_HOST_ENV = {
	PATH: '/snapshot/bin',
	HOME: '/snapshot/home',
	TMPDIR: '/snapshot/tmpdir',
	TMP: '/snapshot/tmp',
	LANG: 'en_US.UTF-8',
	LC_ALL: 'C.UTF-8',
	TERM: 'xterm-256color',
	SHELL: '/bin/bash',
} as const satisfies Readonly<Record<(typeof BASE_ALLOW_LIST)[number], string>>;

const MUTATED_PROCESS_ENV_KEYS = [
	...BASE_ALLOW_LIST,
	'FOO_DECOY',
	'BAR_DECOY',
] as const;

const ORIGINAL_PROCESS_ENV = Object.fromEntries(
	MUTATED_PROCESS_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Readonly<
	Record<(typeof MUTATED_PROCESS_ENV_KEYS)[number], string | undefined>
>;

const restoreProcessEnv = (): void => {
	for (const key of MUTATED_PROCESS_ENV_KEYS) {
		const value = ORIGINAL_PROCESS_ENV[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
};

afterEach(() => {
	restoreProcessEnv();
});

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

	it('snapshots the base allow-list when entry.env is empty so process.env cannot leak through', () => {
		for (const [key, value] of Object.entries(SNAPSHOT_HOST_ENV)) {
			process.env[key] = value;
		}
		process.env.FOO_DECOY = 'should-not-leak';
		process.env.BAR_DECOY = 'leak';

		const result = buildSafeEnv({
			entry: {},
			hostEnv: process.env as Record<string, string | undefined>,
		});

		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`expected ok result, got ${result.code}`);
		}

		expect(Object.keys(result.env).sort()).toEqual(
			[...BASE_ALLOW_LIST].sort(),
		);
		expect(result.env).not.toHaveProperty('FOO_DECOY');
		expect(result.env).not.toHaveProperty('BAR_DECOY');
		expect(result.env).toMatchInlineSnapshot(`
			{
			  "HOME": "/snapshot/home",
			  "LANG": "en_US.UTF-8",
			  "LC_ALL": "C.UTF-8",
			  "PATH": "/snapshot/bin",
			  "SHELL": "/bin/bash",
			  "TERM": "xterm-256color",
			  "TMP": "/snapshot/tmp",
			  "TMPDIR": "/snapshot/tmpdir",
			}
		`);
	});
});
