import { describe, expect, it } from 'vitest';

import { everySliceHandedOver } from '@delendai/proposals/lib/tools/review-verdict-lifecycle';

const doc = (...statuses: string[]): string =>
	`---\nid: x00001\nstatus: in-progress\n---\n\n## slices\n\n${statuses
		.map(
			(status, index) =>
				`### S${String(index + 1)} — work\n- **Status**: ${status}\n`,
		)
		.join('\n')}\n## acceptance\n\n- it works\n`;

describe('everySliceHandedOver', () => {
	it('is true once every slice is in review, done or retired', () => {
		expect(everySliceHandedOver(doc('review', 'done', 'retired'))).toBe(
			true,
		);
	});

	it('is false while a slice is still to do, and for a document with no slices', () => {
		expect(everySliceHandedOver(doc('review', 'in-progress'))).toBe(false);
		expect(everySliceHandedOver(doc('pending'))).toBe(false);
		expect(everySliceHandedOver('# nothing\n')).toBe(false);
	});
});
