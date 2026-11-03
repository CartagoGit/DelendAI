/**
 * slice-listener-standdown.spec.ts — a server that does not hold the
 * maintenance lease reads nothing, and reads once when it takes it over.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createSliceListener } from '@delendai/commit-policy/lib/triggers/slice-listener';

describe('createSliceListener standDown', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('does not read the proposals while another server holds the lease, and reads once it holds', async () => {
		const root = mkdtempSync(join(tmpdir(), 'listener-standdown-'));
		dirs.push(root);
		mkdirSync(join(root, 'proposals', 'ready'), { recursive: true });
		writeFileSync(
			join(root, 'proposals', 'ready', 'x00001-a.md'),
			'---\nid: x00001\n---\n## slices\n### S1 — a\n- **Status**: pending\n- **Files**: `a.ts`\n',
		);
		let blocked: string | undefined = 'another server holds it';
		let asked = 0;
		const handled: string[] = [];
		const listener = createSliceListener(
			root,
			root,
			{ kind: 'slice', onStatuses: ['done'] },
			async (event) => {
				handled.push(event.sliceId ?? '');
				return { ack: 'OK' };
			},
			20,
			root,
			undefined,
			{
				standDown: async () => {
					asked += 1;
					return blocked;
				},
			},
		);
		await listener.start();
		await new Promise((done) => setTimeout(done, 100));
		expect(asked).toBeGreaterThan(1);
		expect(handled).toEqual([]);
		blocked = undefined;
		writeFileSync(
			join(root, 'proposals', 'ready', 'x00001-a.md'),
			'---\nid: x00001\n---\n## slices\n### S1 — a\n- **Status**: done\n- **Files**: `a.ts`\n',
		);
		await new Promise((done) => setTimeout(done, 200));
		listener.stop();
		expect(asked).toBeGreaterThan(2);
	});
});
