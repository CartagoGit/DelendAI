import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IFormatEntry } from '../../../packages/core/src/lib/contracts/interfaces/format-registry.interface';
import {
	currentVersions,
	judgeFormatCompat,
	snapshotIsCurrent,
} from './format-compat.script';

const reader = (version: number) => ({ version, pointer: 'x#y' });

const entry = (over: Partial<IFormatEntry> = {}): IFormatEntry => ({
	id: 'fmt',
	owner: ['src/fmt.ts'],
	introducedAt: 1,
	currentVersion: 1,
	previousReaders: [],
	currentReader: reader(1),
	migrations: [],
	fixtures: { 1: 'a' },
	...over,
});

const at = (version: number) => ({ versions: { fmt: version } });

describe('judgeFormatCompat', () => {
	it('fails a changed writer with no bump', () => {
		const verdict = judgeFormatCompat([entry()], at(1), ['src/fmt.ts']);
		expect(verdict.ok).toBe(false);
	});

	it('passes an unrelated change', () => {
		expect(judgeFormatCompat([entry()], at(1), ['src/other.ts'])).toEqual({
			ok: true,
		});
	});

	it('fails a bump with no reader and no migration', () => {
		const verdict = judgeFormatCompat(
			[entry({ currentVersion: 2, currentReader: reader(2) })],
			at(1),
			['src/fmt.ts'],
		);
		expect(verdict).toMatchObject({ ok: false });
		expect(JSON.stringify(verdict)).toContain('no reader');
		expect(JSON.stringify(verdict)).toContain('no migration');
	});

	it('passes a bump with the reader, the migration and the version', () => {
		const verdict = judgeFormatCompat(
			[
				entry({
					currentVersion: 2,
					currentReader: reader(2),
					previousReaders: [reader(1)],
					migrations: [
						{ from: 1, to: 2, pointer: 'x#m', migrate: (f) => f },
					],
				}),
			],
			at(1),
			['src/fmt.ts'],
		);
		expect(verdict).toEqual({ ok: true });
	});

	it('fails a version that went down', () => {
		expect(judgeFormatCompat([entry()], at(2), [])).toMatchObject({
			ok: false,
		});
	});
});

describe('snapshot', () => {
	it('is current only when it records the registry versions', () => {
		expect(snapshotIsCurrent([entry()], currentVersions([entry()]))).toBe(
			true,
		);
		expect(snapshotIsCurrent([entry()], at(2))).toBe(false);
	});
});

describe('wiring', () => {
	const pkg = JSON.parse(
		readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
	) as { scripts: Record<string, string> };

	it('declares lint:format-compat and chains it into lint:architecture, which CI and the proof run', () => {
		expect(pkg.scripts['lint:format-compat']).toContain(
			'format-compat.script.ts',
		);
		expect(pkg.scripts['lint:architecture']).toContain(
			'lint:format-compat',
		);
	});

	it('keeps the cache-layout ratchet as a case of the lint, not a second script', () => {
		expect(pkg.scripts['lint:cache-layout-ratchet']).toBeUndefined();
	});
});
