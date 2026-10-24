/**
 * review-pack-deletions.service.spec.ts — which removed paths are a
 * deletion and which are a move.
 */
import { describe, expect, it } from 'vitest';

import { deletedDocuments } from '@delendai/core/lib/work-units/review-pack-deletions.service';

const DOCS = 'docs/project';

describe('deletedDocuments', () => {
	it('names a document removed with nothing taking its place', () => {
		expect(
			deletedDocuments(
				[
					`D\t${DOCS}/items/done/x1-closed.md`,
					`M\t${DOCS}/items/review/x2-open.md`,
				],
				DOCS,
			),
		).toEqual([`${DOCS}/items/done/x1-closed.md`]);
	});

	it('reads a removal as a move when the same file appears elsewhere', () => {
		expect(
			deletedDocuments(
				[
					`D\t${DOCS}/items/review/x3-moved.md`,
					`A\t${DOCS}/items/done/x3-moved.md`,
				],
				DOCS,
			),
		).toEqual([]);
	});

	it('judges only documents, with or without a trailing slash on the directory', () => {
		expect(
			deletedDocuments(['D\tsrc/a.ts', `D\t${DOCS}/x4.md`], `${DOCS}/`),
		).toEqual([`${DOCS}/x4.md`]);
		expect(deletedDocuments([], DOCS)).toEqual([]);
		expect(deletedDocuments(['garbage'], DOCS)).toEqual([]);
	});
});
