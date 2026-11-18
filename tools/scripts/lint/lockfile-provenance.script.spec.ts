/**
 * lockfile-provenance.script.spec.ts — what blocks a lockfile entry, what
 * an exception waives, and how a young version is judged (registry read
 * injected, no network).
 */
import { describe, expect, it } from 'vitest';

import {
	changedEntries,
	judgeProvenance,
	readCooldown,
	readLockEntries,
	youngEntries,
} from './lockfile-provenance.script';

const HASH = 'sha512-AAAA';
const lock = (packages: Record<string, unknown[]>): string =>
	`{ "lockfileVersion": 1, "packages": ${JSON.stringify(packages)}, }`;

const clean = lock({
	zod: ['zod@4.6.7', '', {}, HASH],
	'@scope/pkg': ['@scope/pkg@1.0.0', '', {}, HASH],
	'@delendai/env': ['@delendai/env@workspace:packages/env'],
});
const now = new Date('2026-11-18T12:00:00Z');
const cooldown = 259200;

describe('readLockEntries', () => {
	it('[<50ms] accepts registry entries with a hash and workspace links', () => {
		expect(readLockEntries(clean).map((e) => e.problem)).toEqual([
			undefined,
			undefined,
			undefined,
		]);
	});

	it('[<50ms] names a git-sourced entry', () => {
		const [entry] = readLockEntries(
			lock({ evil: ['evil@github:someone/evil#abc123', {}, 'abc123'] }),
		);
		expect(entry?.name).toBe('evil');
		expect(entry?.problem).toContain('not resolved from the npm registry');
	});

	it('[<50ms] names an http tarball and a file entry', () => {
		const entries = readLockEntries(
			lock({
				tar: ['tar@https://example.com/tar.tgz', {}],
				local: ['local@file:../local', {}],
			}),
		);
		expect(entries.every((e) => e.problem !== undefined)).toBe(true);
	});

	it('[<50ms] names an entry served from another registry', () => {
		const [entry] = readLockEntries(
			lock({ zod: ['zod@4.6.7', 'https://evil.example/', {}, HASH] }),
		);
		expect(entry?.problem).toContain('not the npm registry');
	});

	it('[<50ms] names an entry without an integrity hash', () => {
		const [entry] = readLockEntries(lock({ zod: ['zod@4.6.7', '', {}] }));
		expect(entry?.problem).toBe('has no integrity hash');
	});
});

describe('readCooldown', () => {
	it('[<50ms] reads minimumReleaseAge from bunfig.toml', () => {
		expect(readCooldown('[install]\nminimumReleaseAge = 259200\n')).toBe(
			259200,
		);
		expect(readCooldown('[install]\n')).toBeUndefined();
	});
});

describe('youngEntries', () => {
	const added = changedEntries(
		readLockEntries(clean),
		readLockEntries(lock({ zod: ['zod@4.6.7', '', {}, HASH] })),
	);

	it('[<50ms] keeps only entries new or changed against the base', () => {
		expect(added.map((e) => e.name)).toEqual(['@scope/pkg']);
	});

	it('[<50ms] fails a version published one hour ago, naming it', async () => {
		const found = await youngEntries(
			added,
			cooldown,
			now,
			async () => '2026-11-18T11:00:00Z',
		);
		expect(found).toHaveLength(1);
		expect(found[0]?.name).toBe('@scope/pkg');
		expect(found[0]?.problem).toContain(
			'younger than the 259200 s cooldown',
		);
	});

	it('[<50ms] passes a version older than the cooldown', async () => {
		expect(
			await youngEntries(
				added,
				cooldown,
				now,
				async () => '2026-11-01T00:00:00Z',
			),
		).toEqual([]);
	});

	it('[<50ms] fails when the registry cannot be read', async () => {
		await expect(
			youngEntries(added, cooldown, now, async () => {
				throw new Error('the registry answered 503 for @scope/pkg');
			}),
		).rejects.toThrow('503');
	});
});

describe('judgeProvenance', () => {
	const finding = {
		name: 'evil',
		version: 'github:x/evil',
		problem: 'not resolved from the npm registry',
	};
	const exception = (until: string) => ({
		package: 'evil',
		reason: 'a fork carrying a fix',
		until,
	});

	it('[<50ms] sends an unexcepted finding to fix', () => {
		expect(judgeProvenance([finding], [], '2026-11-18').toFix).toEqual([
			'evil@github:x/evil: not resolved from the npm registry',
		]);
	});

	it('[<50ms] waives an excepted entry in date', () => {
		const verdict = judgeProvenance(
			[finding],
			[exception('2026-12-01')],
			'2026-11-18',
		);
		expect(verdict.excepted).toHaveLength(1);
		expect(verdict.toFix).toEqual([]);
	});

	it('[<50ms] fails an expired exception like the entry', () => {
		const verdict = judgeProvenance(
			[finding],
			[exception('2026-11-01')],
			'2026-11-18',
		);
		expect(verdict.expired[0]).toContain('excepted until 2026-11-01');
	});
});
