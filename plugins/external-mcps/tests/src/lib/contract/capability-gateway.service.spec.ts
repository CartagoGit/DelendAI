import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createCapabilityGateway } from '../../../../src/lib/contract/capability-gateway.service';

describe('createCapabilityGateway', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});
	const root = (): string => {
		const dir = mkdtempSync(join(tmpdir(), 'gateway-'));
		roots.push(dir);
		return dir;
	};

	it('lists the tracked component files once, and keeps a raw answer by its handle', async () => {
		const dir = root();
		let listed = 0;
		const gateway = createCapabilityGateway({
			workspaceRoot: dir,
			active: () => false,
			optionsOf: () => ({}),
			rawDir: join(dir, 'raw'),
			git: async () => {
				listed += 1;
				return {
					ok: true,
					output: [
						'src/a.component.ts',
						'src/b.ts',
						'src/c.vue',
					].join('\u0000'),
				};
			},
		});
		expect(await gateway.components()).toEqual([
			'src/a.component.ts',
			'src/c.vue',
		]);
		await gateway.components();
		expect(listed).toBe(1);
		await gateway.keep('ext-raw:abc', '{"x":1}');
		expect(readFileSync(join(dir, 'raw/ext-raw_abc.json'), 'utf8')).toBe(
			'{"x":1}',
		);
		expect(await gateway.contract()).toMatchObject({ from: [] });
		expect(gateway.roleOf).toBeUndefined();
	});

	it('lists nothing without a git runner, and places files when conventions is active', async () => {
		const gateway = createCapabilityGateway({
			workspaceRoot: root(),
			active: (plugin) => plugin === 'conventions',
			optionsOf: () => ({}),
			rawDir: root(),
		});
		expect(await gateway.components()).toEqual([]);
		expect(
			gateway.roleOf?.('packages/core/src/lib/x/y.service.ts'),
		).toBeDefined();
	});
});
