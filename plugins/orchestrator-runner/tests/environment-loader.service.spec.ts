import { describe, expect, it } from 'vitest';

import type { IExecutionEnvironmentModule } from '../src/lib/contracts/interfaces/execution-env-lifecycle.interface';
import { loadExecutionEnvironment } from '../src/lib/services/environment-loader.service';

const moduleWith = (ids: readonly string[]): IExecutionEnvironmentModule => ({
	createBuiltInExecutionEnvRegistry: () => ({
		create: (id) => {
			if (!ids.includes(id)) throw new Error(`unknown ${id}`);
			return {
				id,
				prepare: async () => ({ ok: true }),
				teardown: async () => ({ ok: true }),
			};
		},
	}),
});

describe('loadExecutionEnvironment', () => {
	it('builds the environment from the registry', async () => {
		const environment = await loadExecutionEnvironment(
			{ id: 'local' },
			async () => moduleWith(['local']),
		);
		expect(environment.id).toBe('local');
	});

	it('fails clearly when the package is missing', async () => {
		await expect(
			loadExecutionEnvironment({ id: 'local' }, async () => {
				throw new Error('Cannot find package');
			}),
		).rejects.toThrow(
			/needs the optional package @delendai\/execution-env/u,
		);
	});

	it('fails clearly on an unknown id', async () => {
		await expect(
			loadExecutionEnvironment({ id: 'podman' }, async () =>
				moduleWith(['local']),
			),
		).rejects.toThrow(/"podman" could not be created: unknown podman/u);
	});
});
