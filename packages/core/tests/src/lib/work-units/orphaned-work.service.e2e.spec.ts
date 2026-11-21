/**
 * orphaned-work.service.e2e.spec.ts — a publication delivered a moment ago
 * is waiting for its pull request, not orphaned (x01051).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	publicationPresence,
	readOrphanRescues,
	reportedOrphans,
	writeOrphanRescues,
} from '@delendai/core/lib/work-units/orphaned-work.service';
import { readOrphans } from '@delendai/core/lib/work-units/publication-standings.service';

describe('publicationPresence on a just-delivered publication (x01051)', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

	it('[<1037ms] reads its owner as alive, and as gone when it dates from long ago and carries no tip', async () => {
		const policy = resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-pr' },
		});
		const root = mkdtempSync(join(tmpdir(), 'delivered-'));
		dirs.push(root);
		git(root, 'init', '-q', '--initial-branch', 'develop');
		git(root, 'config', 'user.email', 'o@example.com');
		git(root, 'config', 'user.name', 'O');
		git(root, 'config', 'commit.gpgsign', 'false');
		writeFileSync(join(root, 'a.txt'), 'a\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		const publication = `${policy.branches.publicationRefPrefix.replace(/^refs\/heads\//u, '').replace(/\/$/u, '')}/claude-opus-5-5/implement/x1-all-g1/guard`;
		git(root, 'checkout', '-q', '-b', publication);
		writeFileSync(join(root, 'b.txt'), 'b\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'fix: delivered');
		const tip = git(root, 'rev-parse', 'HEAD');
		git(root, 'checkout', '-q', 'develop');

		const withTips = await publicationPresence({
			root,
			policy,
			publications: [publication],
			tips: new Map([[publication, tip]]),
		});
		expect(withTips.get(publication)?.orphaned).toBe(false);
		const without = await publicationPresence({
			root,
			policy,
			publications: [publication],
		});
		expect(without.get(publication)?.orphaned).toBe(true);
		const read = await readOrphans({
			root,
			policy,
			published: [
				{
					ref: publication,
					agent: 'claude-opus-5-5',
					subject: 'guard',
					tip,
					ahead: 1,
					behind: 0,
					paths: ['b.txt'],
				},
			],
			standings: [],
		});
		expect(read.orphans).toEqual([]);
		expect(read.presence.get(publication)?.orphaned).toBe(false);
	});
});

describe('the rescue count on disk', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});

	it('[<200ms] starts empty, keeps what it was given and tells the owner of the reported', async () => {
		const root = mkdtempSync(join(tmpdir(), 'orphan-rescues-'));
		dirs.push(root);
		expect(await readOrphanRescues(root)).toEqual({ rescues: {} });
		await writeOrphanRescues(root, {
			rescues: {
				a: { attempts: 1 },
				b: { attempts: 3, reportedAt: '2026-11-13T00:00:00.000Z' },
			},
		});
		expect((await readOrphanRescues(root)).rescues.a).toEqual({
			attempts: 1,
		});
		expect(await reportedOrphans(root)).toEqual([
			{
				headRef: 'b',
				attempts: 3,
				reportedAt: '2026-11-13T00:00:00.000Z',
			},
		]);
	});
});
