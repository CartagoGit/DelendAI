import {
	existsSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { coreEvictionRules } from '../../../../src/lib/cache/core-eviction-rules.helper';

describe('coreEvictionRules', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('removes only rotated logs and proposal scratch files, and only once they are old', async () => {
		const root = mkdtempSync(join(tmpdir(), 'core-eviction-'));
		dirs.push(root);
		const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
		for (const name of [
			'hydrate.log.1',
			'f00282-type-gate.log',
			'hydrate.log',
			'proposal-id-counters.json',
			'fresh.log.2',
		]) {
			writeFileSync(join(root, name), 'x');
			if (name !== 'fresh.log.2') utimesSync(join(root, name), old, old);
		}
		const removed: string[] = [];
		for (const rule of coreEvictionRules()) {
			if (rule.when.kind !== 'custom')
				throw new Error('a core rule is custom');
			removed.push(...(await rule.when.run(root, false)));
		}
		expect(removed.sort()).toEqual([
			'f00282-type-gate.log',
			'hydrate.log.1',
		]);
		expect(existsSync(join(root, 'proposal-id-counters.json'))).toBe(true);
		expect(existsSync(join(root, 'hydrate.log'))).toBe(true);
		expect(existsSync(join(root, 'fresh.log.2'))).toBe(true);
	});

	it('removes nothing on a dry run', async () => {
		const root = mkdtempSync(join(tmpdir(), 'core-eviction-'));
		dirs.push(root);
		writeFileSync(join(root, 'a.log.1'), 'x');
		const rule = coreEvictionRules(
			() => Date.now() + 365 * 24 * 60 * 60 * 1000,
		)[0];
		if (rule?.when.kind !== 'custom')
			throw new Error('a core rule is custom');
		expect(await rule.when.run(root, true)).toEqual(['a.log.1']);
		expect(existsSync(join(root, 'a.log.1'))).toBe(true);
	});
});
