import { describe, expect, it } from 'vitest';

import { EXECUTION_CAPABILITIES } from '../../../../src/lib/contracts/constants/execution-capability.constant';
import type { IExecutionEnvironment } from '../../../../src/lib/contracts/interfaces/execution-env.interface';
import { ExecutionEnvRegistry } from '../../../../src/lib/registry/execution-env-registry.service';

const fakeEnvironment = (id: string): IExecutionEnvironment => ({
	id,
	label: `fake ${id}`,
	capabilities: () => ['shell-bash'],
	prepare: async () => ({ ok: true, durationMs: 0 }),
	exec: async (command) => ({
		exitCode: 0,
		stdout: '',
		stderr: '',
		dryRun: false,
		plannedArgv: command,
		durationMs: 0,
	}),
	putFile: async () => undefined,
	getFile: async () => '',
	teardown: async () => ({ ok: true, durationMs: 0 }),
	env: async () => ({}),
});

describe('ExecutionEnvRegistry', () => {
	it('builds an environment by the id it was registered under', () => {
		const registry = new ExecutionEnvRegistry().register({
			id: 'local',
			label: 'Local',
			create: () => fakeEnvironment('local'),
		});
		expect(registry.has('local')).toBe(true);
		expect(registry.create('local').id).toBe('local');
	});

	it('passes the configuration through to the registration', () => {
		const seen: string[] = [];
		const registry = new ExecutionEnvRegistry().register<{ name: string }>({
			id: 'docker-exec',
			label: 'Docker Exec',
			create: (options) => {
				seen.push(options.name);
				return fakeEnvironment('docker-exec');
			},
		});
		registry.create('docker-exec', { name: 'sidecar' });
		expect(seen).toEqual(['sidecar']);
	});

	it('refuses a second registration of the same id', () => {
		const registry = new ExecutionEnvRegistry().register({
			id: 'ssh',
			label: 'SSH',
			create: () => fakeEnvironment('ssh'),
		});
		expect(() =>
			registry.register({
				id: 'ssh',
				label: 'Other',
				create: () => fakeEnvironment('ssh'),
			}),
		).toThrow('already registered: ssh');
	});

	it('refuses an empty id', () => {
		expect(() =>
			new ExecutionEnvRegistry().register({
				id: '  ',
				label: 'Blank',
				create: () => fakeEnvironment('blank'),
			}),
		).toThrow('must not be empty');
	});

	it('names the registered ids when asked for an unknown one', () => {
		const registry = new ExecutionEnvRegistry().register({
			id: 'local',
			label: 'Local',
			create: () => fakeEnvironment('local'),
		});
		expect(() => registry.create('nope')).toThrow(
			'unknown execution environment "nope"; registered: local',
		);
	});

	it('lists ids in registration order', () => {
		const registry = new ExecutionEnvRegistry()
			.register({
				id: 'b',
				label: 'B',
				create: () => fakeEnvironment('b'),
			})
			.register({
				id: 'a',
				label: 'A',
				create: () => fakeEnvironment('a'),
			});
		expect(registry.ids()).toEqual(['b', 'a']);
	});
});

describe('EXECUTION_CAPABILITIES', () => {
	it('names the eight capabilities the contract promises', () => {
		expect([...EXECUTION_CAPABILITIES].sort()).toEqual(
			[
				'forward-secrets',
				'isolated-filesystem',
				'isolated-network',
				'persistent-workspace',
				'preserve-between-slices',
				'shell-bash',
				'shell-pwsh',
				'suspend-resume',
			].sort(),
		);
	});
});
