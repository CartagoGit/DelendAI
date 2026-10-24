/**
 * Changes left in the shared checkout on the integration branch are
 * announced on every tool result (x00669).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	createLooseEditsAdvisory,
	looseEditsAdvisoryFor,
} from '@delendai/core/lib/development-policy/loose-edits-advisory';

const CONTEXT = { toolName: 'any_tool', args: {} };
const REFUSED = 'this call would write into the shared checkout on develop';

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const settle = (): Promise<void> =>
	new Promise((resolveSettle) => {
		setTimeout(resolveSettle, 0);
	});

describe('looseEditsAdvisoryFor', () => {
	it('says nothing outside the guarded checkout, or when it is clean', () => {
		expect(
			looseEditsAdvisoryFor({ refusal: undefined, paths: ['a.ts'] }),
		).toBeNull();
		expect(
			looseEditsAdvisoryFor({ refusal: REFUSED, paths: [] }),
		).toBeNull();
	});

	it('names the changes, why they are at risk, and what to do', () => {
		const advisory = looseEditsAdvisoryFor({
			refusal: REFUSED,
			paths: ['b.ts', 'a.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts'],
		});
		expect(advisory).toMatchObject({
			triggered: true,
			code: 'LOOSE_EDITS_ON_INTEGRATION',
			severity: 'strong',
			reason: REFUSED,
		});
		expect(advisory?.message).toContain('7 uncommitted change(s)');
		expect(advisory?.message).toContain('a.ts, b.ts, c.ts, d.ts, e.ts');
		expect(advisory?.message).toContain('and 2 more');
		expect(advisory?.nextAction).toContain('never discard another agent');
	});

	it('keys the advisory on the set of changes, whatever their order', () => {
		const one = looseEditsAdvisoryFor({
			refusal: REFUSED,
			paths: ['a', 'b'],
		});
		const two = looseEditsAdvisoryFor({
			refusal: REFUSED,
			paths: ['b', 'a'],
		});
		expect(one?.dedupeKey).toBe(two?.dedupeKey);
	});
});

describe('createLooseEditsAdvisory', () => {
	it('answers from the last reading and reads again only after the interval', async () => {
		let clock = 0;
		let reads = 0;
		let paths: readonly string[] = ['a.ts'];
		const provider = createLooseEditsAdvisory('/repo', {
			now: () => clock,
			intervalMs: 1000,
			read: async () => {
				reads += 1;
				return { refusal: REFUSED, paths };
			},
		});

		// The first call starts a reading and does not wait for it.
		expect(provider(CONTEXT)).toBeNull();
		await settle();
		expect(provider(CONTEXT)?.message).toContain('a.ts');
		expect(reads).toBe(1);

		paths = [];
		clock = 999;
		provider(CONTEXT);
		await settle();
		expect(reads).toBe(1);
		clock = 1000;
		provider(CONTEXT);
		await settle();
		expect(reads).toBe(2);
		expect(provider(CONTEXT)).toBeNull();
	});

	it('announces a change left in a real shared checkout on the integration branch', async () => {
		const root = mkdtempSync(join(tmpdir(), 'loose-edits-'));
		roots.push(root);
		const git = (...args: string[]) =>
			execFileSync('git', args, { cwd: root, encoding: 'utf8' });
		git('init', '-q', '-b', 'develop');
		git('config', 'user.email', 't@example.invalid');
		git('config', 'user.name', 'T');
		writeFileSync(
			join(root, 'delendai.config.json'),
			JSON.stringify({
				development: {
					profile: 'shared-checkout-pr',
					branches: {
						integration: 'develop',
						namespacePrefix: 'acme',
					},
				},
			}),
		);
		writeFileSync(join(root, 'a.txt'), 'a\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'base');
		writeFileSync(join(root, 'a.txt'), 'changed by hand\n');

		let clock = 0;
		const provider = createLooseEditsAdvisory(root, {
			env: {},
			now: () => clock,
		});
		provider(CONTEXT);
		await expect
			.poll(() => {
				clock += 1;
				return provider(CONTEXT)?.message ?? '';
			})
			.toContain('a.txt');
	});
});
