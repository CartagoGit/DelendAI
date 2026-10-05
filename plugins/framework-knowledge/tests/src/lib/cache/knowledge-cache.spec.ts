/**
 * knowledge-cache.spec.ts — the cache keyed by resolved version.
 * Every test works in its own temporary directory.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	knowledgeDir,
	readEvidence,
	readSummary,
	writeKnowledge,
} from '../../../../src/lib/cache/knowledge-cache';
import type { IKnowledgeRecord } from '../../../../src/lib/contracts/interfaces/knowledge-record.interface';

const KEY = { frameworkId: 'angular', version: '17.3.2' } as const;
const ENTRY = 'lockfile:@angular/core@17.3.2';

const record = (id: string, topic: string): IKnowledgeRecord => ({
	id,
	frameworkId: 'angular',
	appliesToVersion: '17.x',
	topic,
	statement: `statement of ${id}`,
	force: 'recommended',
	evidence: {
		source: `https://angular.dev/${id}`,
		retrievedAt: '2026-09-01T00:00:00Z',
	},
});

let root: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'knowledge-cache-'));
});

afterEach(async () => {
	vi.unstubAllGlobals();
	await rm(root, { recursive: true, force: true });
});

describe('the knowledge cache', () => {
	it('misses before anything is written', async () => {
		expect(await readSummary(root, KEY, ENTRY)).toEqual({
			hit: false,
			reason: 'absent',
		});
	});

	it('hits after a write and narrows by topic', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [
				record('inline-template', 'templates'),
				record('x', 'other'),
			],
		});
		const result = await readSummary(root, KEY, ENTRY, 'templates');
		expect(result.hit && result.entries.map((entry) => entry.id)).toEqual([
			'inline-template',
		]);
		const all = await readSummary(root, KEY, ENTRY);
		expect(all.hit && all.entries).toHaveLength(2);
	});

	it('keeps the summary free of evidence and the evidence apart', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [record('inline-template', 'templates')],
		});
		const dir = knowledgeDir(root, KEY) as string;
		const summaryText = await readFile(join(dir, 'summary.json'), 'utf8');
		expect(summaryText).not.toContain('angular.dev');
		expect(summaryText).not.toContain('retrievedAt');
		const evidence = await readEvidence(
			root,
			KEY,
			ENTRY,
			'inline-template',
		);
		expect(evidence).toMatchObject({
			hit: true,
			evidence: { source: 'https://angular.dev/inline-template' },
		});
	});

	it('reads the summary without opening the evidence file', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [record('a', 'templates')],
		});
		await writeFile(
			join(knowledgeDir(root, KEY) as string, 'evidence.json'),
			'{',
		);
		expect((await readSummary(root, KEY, ENTRY)).hit).toBe(true);
		expect(await readEvidence(root, KEY, ENTRY, 'a')).toEqual({
			hit: false,
			reason: 'corrupt',
		});
	});

	it('is invalidated when the lockfile entry changes', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [record('a', 'templates')],
		});
		const changed = 'lockfile:@angular/core@17.3.2+patched';
		expect(await readSummary(root, KEY, changed)).toEqual({
			hit: false,
			reason: 'stale',
		});
		expect((await readEvidence(root, KEY, changed, 'a')).hit).toBe(false);
	});

	it('keeps one directory per version', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [record('a', 'templates')],
		});
		const other = { frameworkId: 'angular', version: '18.0.0' };
		expect((await readSummary(root, other, ENTRY)).hit).toBe(false);
	});

	it('reports an unknown rule and an unusable file distinctly', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [record('a', 'templates')],
		});
		expect(await readEvidence(root, KEY, ENTRY, 'missing')).toEqual({
			hit: false,
			reason: 'unknown-rule',
		});
		expect(await readEvidence(root, KEY, ENTRY, 'constructor')).toEqual({
			hit: false,
			reason: 'unknown-rule',
		});
		await writeFile(
			join(knowledgeDir(root, KEY) as string, 'summary.json'),
			'{',
		);
		expect(await readSummary(root, KEY, ENTRY)).toEqual({
			hit: false,
			reason: 'corrupt',
		});
		await writeFile(
			join(knowledgeDir(root, KEY) as string, 'meta.json'),
			'nope',
		);
		expect(await readSummary(root, KEY, ENTRY)).toEqual({
			hit: false,
			reason: 'corrupt',
		});
	});

	it('refuses a key that would leave the cache directory', async () => {
		const evil = { frameworkId: 'angular', version: '../../x' };
		expect(knowledgeDir(root, evil)).toBeUndefined();
		expect(
			await writeKnowledge(root, {
				key: evil,
				lockEntry: ENTRY,
				records: [],
			}),
		).toEqual({ ok: false, reason: 'unsafe cache key' });
		expect(await readSummary(root, evil, ENTRY)).toEqual({
			hit: false,
			reason: 'absent',
		});
		expect(await readEvidence(root, evil, ENTRY, 'a')).toEqual({
			hit: false,
			reason: 'absent',
		});
	});

	it('answers offline: a hit performs no network call', async () => {
		await writeKnowledge(root, {
			key: KEY,
			lockEntry: ENTRY,
			records: [record('a', 'templates')],
		});
		const fetchSpy = vi.fn(() => {
			throw new Error('network is off');
		});
		vi.stubGlobal('fetch', fetchSpy);
		expect((await readSummary(root, KEY, ENTRY)).hit).toBe(true);
		expect((await readEvidence(root, KEY, ENTRY, 'a')).hit).toBe(true);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
