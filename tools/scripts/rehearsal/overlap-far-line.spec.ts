import { describe, expect, it } from 'vitest';

import overlap from '../../../rehearsal/shared/overlap.txt?raw';

const LINE = 25;

describe('the rehearsal overlap file', () => {
	it('[<50ms] keeps the content the setup gave the line no pull request of this one is meant to change', () => {
		expect(overlap.split('\n')[LINE]).toBe(`line ${String(LINE)}`);
	});
});
