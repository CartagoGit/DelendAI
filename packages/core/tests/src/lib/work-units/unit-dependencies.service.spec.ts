import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { installUnitDependencies } from '../../../../src/lib/work-units/unit-dependencies.service';

describe('installUnitDependencies', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const unit = (files: Record<string, string>): string => {
		const dir = mkdtempSync(join(tmpdir(), 'unit-deps-'));
		dirs.push(dir);
		for (const [name, text] of Object.entries(files))
			writeFileSync(join(dir, name), text);
		return dir;
	};

	it('leaves a worktree that already has its modules, or has no lockfile, as it is', async () => {
		const withModules = unit({ 'bun.lock': '{}' });
		mkdirSync(join(withModules, 'node_modules'));
		expect(await installUnitDependencies(withModules, {})).toEqual({
			status: 'present',
		});
		expect(await installUnitDependencies(unit({}), {})).toEqual({
			status: 'skipped',
			reason: 'no lockfile',
		});
	});

	it('installs nothing when told off', async () => {
		expect(
			await installUnitDependencies(unit({ 'bun.lock': '{}' }), {
				DELENDAI_UNIT_INSTALL: 'off',
			}),
		).toMatchObject({
			status: 'skipped',
		});
	});

	it('says what failed and the command that installs, never failing the entry', async () => {
		const answer = await installUnitDependencies(
			unit({
				'package.json':
					'{"name":"u","dependencies":{"left-pad":"1.3.0"}}',
				'bun.lock': 'not a lockfile',
			}),
			{},
		);
		expect(answer).toMatchObject({
			status: 'failed',
			command: 'bun install --frozen-lockfile --ignore-scripts',
		});
	});
});
