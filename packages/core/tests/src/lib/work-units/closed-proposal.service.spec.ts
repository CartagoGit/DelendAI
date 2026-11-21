import { describe, expect, it } from 'vitest';

import { closedState } from '../../../../src/lib/work-units/closed-proposal.service';

const DOCUMENT = [
	'## slices',
	'',
	'### S1 — finished',
	'- **Status**: done',
	'',
	'### S2 — still open',
	'- **Status**: pending',
].join('\n');

describe('closedState', () => {
	it('names a proposal in done/ closed, whatever the slice', () => {
		expect(
			closedState(
				'docs/delendai/proposals/done/fixes/x1-a.md',
				DOCUMENT,
				'S2',
			),
		).toBe('the proposal is in done/');
	});

	it('names a done slice closed, and leaves an open one and the whole proposal', () => {
		const path = 'docs/delendai/proposals/in-progress/x1-a.md';
		expect(closedState(path, DOCUMENT, 'S1')).toBe('slice S1 is done');
		expect(closedState(path, DOCUMENT, 'S2')).toBeUndefined();
		expect(closedState(path, DOCUMENT, 'all')).toBeUndefined();
	});
});
