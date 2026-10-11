import { describe, expect, it } from 'vitest';

import { createBuiltInExecutionEnvRegistry } from '../../../../src/lib/registry/built-in-registry.service';

describe('createBuiltInExecutionEnvRegistry', () => {
	it('registers every shipped adapter under its config id', () => {
		expect(createBuiltInExecutionEnvRegistry().ids()).toEqual([
			'local',
			'docker-cli',
			'docker-compose',
			'docker-exec',
			'ssh',
		]);
	});

	it('builds the local adapter from its options', () => {
		const environment = createBuiltInExecutionEnvRegistry().create(
			'local',
			{ workspaceRoot: '/work', dryRun: true },
		);
		expect(environment.id).toBeTruthy();
	});

	it('names the registered ids when the id is unknown', () => {
		expect(() =>
			createBuiltInExecutionEnvRegistry().create('podman'),
		).toThrow(/unknown execution environment "podman".*local/u);
	});

	it.each([
		['docker-cli', { image: 'alpine:3' }],
		[
			'docker-compose',
			{
				workspaceRoot: '/work',
				composeFile: 'compose.yml',
				service: 'app',
			},
		],
		['docker-exec', { container: 'app-1' }],
		['ssh', { host: 'example.test' }],
	])('builds the %s adapter from its options', (id, options) => {
		const environment = createBuiltInExecutionEnvRegistry().create(
			id,
			options,
		);
		expect(environment.id.length).toBeGreaterThan(0);
	});
});
