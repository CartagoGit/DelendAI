import { describe, expect, it } from 'vitest';

import { ServerEntrySchema } from '../../../src/lib/options-schema';

const entry = (over: Record<string, unknown> = {}) => ({
	version: '1.4.2',
	command: 'stub-mcp',
	args: ['--stdio'],
	...over,
});

describe('ServerEntrySchema', () => {
	it('accepts eager:true as part of the declared server contract', () => {
		const parsed = ServerEntrySchema.parse(entry({ eager: true }));
		expect(parsed.eager).toBe(true);
	});

	it('defaults eager to false when omitted', () => {
		const parsed = ServerEntrySchema.parse(entry());
		expect(parsed.eager).toBe(false);
	});
});
