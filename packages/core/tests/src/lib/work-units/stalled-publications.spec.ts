/**
 * stalled-publications.spec.ts — a publication nobody has moved since its
 * author went quiet is reported; one still fresh is waiting, not stuck.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
	abandonedAfterSeconds,
	stalledPublicationsInvariant,
} from '@delendai/core/lib/work-units/forge-work-refs.service';

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const LEASE_TTL_MINUTES = 30;
const REF = 'delendai/pr/agent-a/review/x1-review-g1/verdicts';

/** A clone whose forge holds one publication, and when its tip was made. */
const published = (): { root: string; tipAt: number } => {
	const remote = mkdtempSync(join(tmpdir(), 'stalled-remote-'));
	const root = mkdtempSync(join(tmpdir(), 'stalled-'));
	dirs.push(remote, root);
	git(remote, 'init', '-q', '--bare');
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.name', 'spec');
	git(root, 'config', 'user.email', 'spec@example.invalid');
	writeFileSync(join(root, 'a.txt'), 'a\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'work');
	git(root, 'remote', 'add', 'origin', remote);
	git(root, 'push', '-q', 'origin', `HEAD:refs/heads/${REF}`);
	git(root, 'fetch', '-q', 'origin');
	return { root, tipAt: Number(git(root, 'log', '-1', '--format=%ct')) };
};

const judge = (root: string, now: number, refs: readonly string[] = [REF]) =>
	stalledPublicationsInvariant({
		root,
		remote: 'origin',
		published: refs,
		leaseTtlMinutes: LEASE_TTL_MINUTES,
		now,
	});

describe('stalledPublicationsInvariant', () => {
	it('holds while the publication is fresh: it is waiting its turn', () => {
		const { root, tipAt } = published();
		const result = judge(root, tipAt + 60);
		expect(result.holds).toBe(true);
		expect(result.observed).toBe('1 ref(s), none stalled');
	});

	it('fails once nobody has moved it for longer than a unit is given, and says how long', () => {
		const { root, tipAt } = published();
		const hours = 14;
		const result = judge(
			root,
			tipAt + abandonedAfterSeconds(LEASE_TTL_MINUTES) + hours * 3600,
		);
		expect(result.holds).toBe(false);
		expect(result.id).toBe('publications-move');
		expect(result.observed).toContain(REF);
		expect(result.observed).toMatch(/\(\d+ h\)/u);
		expect(result.remedy).toContain('on its own publication');
		expect(result.remedy).toContain('delendai work retire --ref=<ref>');
	});

	it('does not judge a ref this clone never fetched, and holds with none at all', () => {
		const { root, tipAt } = published();
		const far = tipAt + 10 * abandonedAfterSeconds(LEASE_TTL_MINUTES);
		expect(
			judge(root, far, ['delendai/pr/agent-b/never-fetched']).holds,
		).toBe(true);
		expect(judge(root, far, []).observed).toBe('no publication refs');
	});
});
