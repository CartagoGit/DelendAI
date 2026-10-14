import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	recordsDir,
	rememberAppliedCacheDir,
} from '../../../../src/lib/shared/delendai-records';
import { relocateLegacyRecords } from '../../../../src/lib/workspace-migration/legacy-records-relocation.service';

describe('an older layout is moved into the records folder', () => {
	const roots: string[] = [];
	afterEach(() => {
		for (const root of roots.splice(0))
			rmSync(root, { recursive: true, force: true });
	});
	const workspace = (): string => {
		const root = mkdtempSync(join(tmpdir(), 'legacy-records-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		return root;
	};

	it('moves every record, keeps what the new place has, leaves state to its migrator, and removes the spent folder', async () => {
		const root = workspace();
		const legacy = join(root, '.delendai');
		mkdirSync(join(legacy, 'migration-backups'), { recursive: true });
		writeFileSync(join(legacy, '.gitignore'), '*\n');
		writeFileSync(join(legacy, 'migrations-applied.json'), '["a"]\n');
		writeFileSync(join(legacy, 'applied-config.json'), '{"old":true}\n');
		writeFileSync(join(legacy, 'migration-backups', 'x.json'), '{}\n');
		mkdirSync(recordsDir(root), { recursive: true });
		writeFileSync(
			join(recordsDir(root), 'applied-config.json'),
			'{"new":true}\n',
		);

		const outcome = await relocateLegacyRecords(root);

		expect([...outcome.moved].sort()).toEqual([
			'migration-backups',
			'migrations-applied.json',
		]);
		expect(outcome.kept).toEqual(['applied-config.json']);
		expect(
			readFileSync(
				join(recordsDir(root), 'migrations-applied.json'),
				'utf8',
			),
		).toBe('["a"]\n');
		expect(
			readFileSync(join(recordsDir(root), 'applied-config.json'), 'utf8'),
		).toBe('{"new":true}\n');
		expect(existsSync(join(legacy, 'applied-config.json'))).toBe(true);

		rmSync(join(legacy, 'applied-config.json'));
		mkdirSync(join(legacy, 'state'));
		await relocateLegacyRecords(root);
		expect(existsSync(join(legacy, 'state'))).toBe(true);
		rmSync(join(legacy, 'state'), { recursive: true });
		await relocateLegacyRecords(root);
		expect(existsSync(legacy)).toBe(false);
	});

	it('leaves what the project wrote itself in .delendai/, and the folder with it', async () => {
		const root = workspace();
		const legacy = join(root, '.delendai');
		mkdirSync(join(legacy, 'skills', 'acme'), { recursive: true });
		mkdirSync(join(legacy, 'knowledge'), { recursive: true });
		writeFileSync(join(legacy, 'skills', 'acme', 'SKILL.md'), '# acme\n');
		writeFileSync(join(legacy, 'migrations-applied.json'), '[]\n');

		const outcome = await relocateLegacyRecords(root);

		expect(outcome.moved).toEqual(['migrations-applied.json']);
		expect(existsSync(join(legacy, 'skills', 'acme', 'SKILL.md'))).toBe(
			true,
		);
		expect(existsSync(join(legacy, 'knowledge'))).toBe(true);
		expect(existsSync(join(recordsDir(root), 'skills'))).toBe(false);
	});

	it('finds the records where the cache was last applied, wherever the configuration now points', () => {
		const root = workspace();
		expect(recordsDir(root)).toBe(
			join(root, '.cache', 'delendai', 'records'),
		);
		writeFileSync(
			join(root, 'delendai.config.json'),
			'{ "cacheDir": "var/cache" }\n',
		);
		expect(recordsDir(root)).toBe(join(root, 'var', 'cache', 'records'));
		rememberAppliedCacheDir(root, '.cache/elsewhere');
		expect(recordsDir(root)).toBe(
			join(root, '.cache', 'elsewhere', 'records'),
		);
	});
});
