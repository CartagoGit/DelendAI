import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '../../../../src/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '../../../../src/lib/development-policy/validate';

describe('the integration options', () => {
	it('[<50ms] default to an App identity, overlap batching and a hands-off engine', () => {
		const { integration } = resolveDevelopmentPolicy({});
		expect(integration.engine).toBe('none');
		expect(integration.identity.kind).toBe('app');
		expect(integration.batching).toBe('overlap');
		expect(integration.labels.prefix).toBe('delendai');
		expect(integration.derived).toEqual({ paths: [], command: '' });
		expect(integration.commands).toEqual({ jobs: '', normalizeBatch: '' });
		expect(integration.watchdog.enabled).toBe(true);
		expect(integration.rehearsal.scenarios).toEqual(['all']);
	});

	it('[<50ms] take a project value one field at a time and keep the rest', () => {
		const { integration } = resolveDevelopmentPolicy({
			development: {
				integration: {
					identity: { kind: 'pat', tokenSecret: 'MY_TOKEN' },
					derived: { paths: ['gen/**'], command: 'make gen' },
					commands: { jobs: 'make jobs' },
					zones: ['a/*'],
					signalWorkflows: ['ci'],
					scanWorkflows: ['scan'],
					watchdog: { enabled: false },
					rehearsal: { secrets: ['S'] },
					labels: { prefix: 'x' },
					batching: 'off',
				},
			},
		});
		expect(integration.identity).toEqual({
			kind: 'pat',
			appIdVariable: 'DELENDAI_APP_ID',
			keySecret: 'DELENDAI_APP_PRIVATE_KEY',
			tokenSecret: 'MY_TOKEN',
		});
		expect(integration.derived.command).toBe('make gen');
		expect(integration.commands).toEqual({
			jobs: 'make jobs',
			normalizeBatch: '',
		});
		expect(integration.zones).toEqual(['a/*']);
		expect(integration.signalWorkflows).toEqual(['ci']);
		expect(integration.scanWorkflows).toEqual(['scan']);
		expect(integration.watchdog).toEqual({
			enabled: false,
			cron: '17 * * * *',
		});
		expect(integration.rehearsal.secrets).toEqual(['S']);
		expect(integration.labels.prefix).toBe('x');
		expect(integration.batching).toBe('off');
	});

	it('[<50ms] refuse an identity kind or a batching mode that does not exist', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				integration: { identity: { kind: 'token' }, batching: 'all' },
			},
		});
		const paths = validateDevelopmentPolicy(policy).map((v) => v.path);
		expect(paths).toContain('integration.identity.kind');
		expect(paths).toContain('integration.batching');
	});
});
