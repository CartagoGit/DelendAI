import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { watchProposals } from '@delendai/commit-policy/lib/triggers/proposals-watch.service';

describe('watchProposals', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const folder = (): string => {
		const dir = mkdtempSync(join(tmpdir(), 'proposals-watch-'));
		dirs.push(dir);
		mkdirSync(join(dir, 'ready'));
		return dir;
	};

	it('calls once for a burst of changes, and not at all while nothing changes', async () => {
		const dir = folder();
		let calls = 0;
		const watching = await watchProposals(dir, () => (calls += 1), 50);
		expect(watching).toBeDefined();
		await new Promise((done) => setTimeout(done, 150));
		expect(calls).toBe(0);
		writeFileSync(join(dir, 'ready', 'a.md'), '1');
		writeFileSync(join(dir, 'ready', 'b.md'), '2');
		await new Promise((done) => setTimeout(done, 400));
		watching?.close();
		expect(calls).toBe(1);
	});

	it('answers undefined for a directory that is not there', async () => {
		expect(
			await watchProposals(
				join(tmpdir(), 'no-such-proposals-dir'),
				() => undefined,
			),
		).toBeUndefined();
	});
});
