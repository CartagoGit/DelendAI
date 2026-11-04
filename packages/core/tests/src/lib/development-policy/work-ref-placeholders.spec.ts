import { describe, expect, it } from 'vitest';

import { workRefTailSegments } from '@delendai/core/lib/development-policy/work-ref-placeholders';
import { WORK_REF_SHAPE } from '@delendai/core/lib/development-policy/profiles.constant';

describe('workRefTailSegments', () => {
	it('counts the components from the first placeholder, whatever the namespace', () => {
		expect(
			workRefTailSegments(`heads/delendai/wip/${WORK_REF_SHAPE}`),
		).toBe(4);
		expect(workRefTailSegments(`wip/${WORK_REF_SHAPE}`)).toBe(4);
		expect(workRefTailSegments(WORK_REF_SHAPE)).toBe(4);
	});

	it('follows a template that spells a different shape', () => {
		expect(workRefTailSegments('wip/${agent}/${topic}')).toBe(2);
	});

	it('is zero when nothing in the template varies', () => {
		expect(workRefTailSegments('')).toBe(0);
		expect(workRefTailSegments('wip/fixed')).toBe(0);
	});
});
