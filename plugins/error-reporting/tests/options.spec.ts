import { describe, expect, it } from 'vitest';

import {
	DEFAULT_LABELS,
	DEFAULT_TARGET_REPO,
	resolveOptions,
} from '../src/lib/contracts/constants/options.constant';

describe('resolveOptions', () => {
	it('applies the intrinsic defaults when nothing is configured', () => {
		const options = resolveOptions({});
		expect(options.enabled).toBe(true);
		expect(options.targetRepo).toBe(DEFAULT_TARGET_REPO);
		expect(options.labels).toEqual([...DEFAULT_LABELS]);
		expect(options.internalOnly).toBe(true);
		expect(options.dedupeWindowHours).toBe(24);
	});

	it('honours every override', () => {
		const options = resolveOptions({
			enabled: false,
			targetRepo: 'acme/tools',
			labels: ['custom'],
			internalOnly: false,
			dedupeWindowHours: 1,
		});
		expect(options.enabled).toBe(false);
		expect(options.targetRepo).toBe('acme/tools');
		expect(options.labels).toEqual(['custom']);
		expect(options.internalOnly).toBe(false);
		expect(options.dedupeWindowHours).toBe(1);
	});

	it('falls back to defaults on malformed values', () => {
		const options = resolveOptions({
			enabled: 'nope',
			dedupeWindowHours: -5,
		});
		expect(options.enabled).toBe(true);
		expect(options.dedupeWindowHours).toBe(24);
	});
});
