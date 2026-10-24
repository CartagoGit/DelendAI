import { describe, expect, it } from 'vitest';

import {
	CAPABILITY_NAMES,
	capabilityNeedsAck,
	capabilityOf,
} from '../../../../src/lib/capability/capability-registry.service';

describe('capability registry', () => {
	it('names capabilities, not products, each with core effects', () => {
		expect(CAPABILITY_NAMES).toContain('design.read');
		expect(
			CAPABILITY_NAMES.every((name) => /^[a-z]+\.[a-z]+$/u.test(name)),
		).toBe(true);
		for (const name of CAPABILITY_NAMES)
			for (const effect of capabilityOf(name)?.effects ?? [])
				expect(['write', 'spawn', 'network', 'destructive']).toContain(
					effect,
				);
		expect(capabilityOf('figma.read')).toBeUndefined();
	});

	it('gates only the destructive ones behind an ack', () => {
		const gated = CAPABILITY_NAMES.filter((name) => {
			const capability = capabilityOf(name);
			return capability !== undefined && capabilityNeedsAck(capability);
		});
		expect(gated).toEqual(['database.write']);
	});
});
