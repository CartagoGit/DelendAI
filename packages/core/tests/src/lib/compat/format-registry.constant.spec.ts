/**
 * format-registry.constant.spec.ts — every registered reader parses a
 * fixture of its version, and every migration turns that fixture into one
 * the current reader accepts, idempotently.
 */
import { parseProposalFrontmatter } from '@delendai/proposals-sqlite';
import { describe, expect, it } from 'vitest';

import { FORMAT_REGISTRY } from '@delendai/core/lib/compat/format-registry.constant';
import type { IFormatReader } from '@delendai/core/lib/contracts/interfaces/format-registry.interface';

/** Readers that live in a package depending on core, injected by pointer. */
const EXTERNAL_READERS: Readonly<
	Record<string, (fixture: unknown) => boolean>
> = {
	'frontmatter.helper#parseProposalFrontmatter': (fixture) =>
		Object.keys(parseProposalFrontmatter(String(fixture)).value).length > 0,
};

const run = (reader: IFormatReader, fixture: unknown): boolean => {
	const read = reader.read ?? EXTERNAL_READERS[reader.pointer];
	if (read === undefined) throw new Error(`no reader for ${reader.pointer}`);
	return read(fixture);
};

describe('FORMAT_REGISTRY', () => {
	it('lists every format delendai owns, once', () => {
		const ids = FORMAT_REGISTRY.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(
			expect.arrayContaining([
				'work-ref',
				'proposal-file',
				'delendai-config',
				'cache-layout',
				'tool-output',
				'idempotency-snapshot',
			]),
		);
	});

	for (const entry of FORMAT_REGISTRY) {
		describe(entry.id, () => {
			it('names its current version and a fixture the current reader parses', () => {
				expect(entry.currentReader.version).toBe(entry.currentVersion);
				expect(
					run(
						entry.currentReader,
						entry.fixtures[entry.currentVersion],
					),
				).toBe(true);
			});

			it('parses a fixture with every previous reader', () => {
				for (const reader of entry.previousReaders) {
					expect(run(reader, entry.fixtures[reader.version])).toBe(
						true,
					);
				}
			});

			it('says so when it records the current version only', () => {
				if (entry.previousReaders.length === 0) {
					expect(entry.note ?? entry.migrations.length).toBeTruthy();
				}
			});

			it('migrates each fixture to one the current reader accepts, idempotently', () => {
				for (const m of entry.migrations) {
					expect(m.to).toBe(m.from + 1);
				}
				for (const version of Object.keys(entry.fixtures).map(Number)) {
					let value = entry.fixtures[version];
					for (const m of entry.migrations) value = m.migrate(value);
					expect(run(entry.currentReader, value)).toBe(true);
					let again = value;
					for (const m of entry.migrations) again = m.migrate(again);
					expect(again).toEqual(value);
				}
			});
		});
	}
});
