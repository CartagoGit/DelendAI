/**
 * urgent-turn.service.spec.ts — a proof is urgent only for a repair of a red
 * integration branch, or when the caller says why.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { urgentReasonOf } from '@delendai/core/lib/work-units/urgent-turn.service';

const roots: string[] = [];
const rootWith = (kind: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'urgent-turn-'));
	roots.push(root);
	const dir = join(root, 'docs', 'delendai', 'proposals', 'ready');
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'x00001-a-repair.md'),
		`---\nid: x00001\nkind: ${kind}\n---\n`,
	);
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const red = () => Promise.resolve('failure');
const green = () => Promise.resolve('success');

describe('urgentReasonOf', () => {
	it('is urgent when a fix meets a red integration branch', async () => {
		const reason = await urgentReasonOf({
			root: rootWith('fix'),
			args: [],
			proposal: 'x00001',
			integration: 'develop',
			certification: red,
		});
		expect(reason).toMatch(/x00001 repairs develop/u);
	});

	it('is not urgent for a fix on a green branch, or a feature on a red one', async () => {
		const asked = (kind: string, certification: typeof red) =>
			urgentReasonOf({
				root: rootWith(kind),
				args: [],
				proposal: 'x00001',
				integration: 'develop',
				certification,
			});
		expect(await asked('fix', green)).toBeUndefined();
		expect(await asked('feat', red)).toBeUndefined();
	});

	it('takes the stated reason from --urgent, whatever the branch', async () => {
		expect(
			await urgentReasonOf({
				root: rootWith('feat'),
				args: ['--urgent=the owner is waiting'],
				proposal: 'x00001',
				integration: 'develop',
				certification: green,
			}),
		).toBe('the owner is waiting');
	});
});
