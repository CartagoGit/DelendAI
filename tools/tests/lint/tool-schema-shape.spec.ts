import { describe, expect, it } from 'vitest';

import { findShapeRegistrations } from '../../scripts/lint/tool-schema-shape.script';

describe('tool-schema-shape', () => {
	it('flags a registration that passes a raw shape', () => {
		const findings = findShapeRegistrations(
			'plugins/x/src/lib/tools/a.tool.ts',
			['{', '\tinputSchema: someInputSchema.shape,', '}'].join('\n'),
		);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.line).toBe(2);
	});

	it('flags outputSchema too, and an inline single-line registration', () => {
		const findings = findShapeRegistrations(
			'plugins/x/src/lib/tools/b.tool.ts',
			'server.registerTool(name, { inputSchema: a.shape, outputSchema: b.shape }, run);',
		);

		// One line, so one finding — the message points at the line, and
		// the fix is the same for both occurrences on it.
		expect(findings).toHaveLength(1);
	});

	it('accepts a whole schema, which is what the wrapper requires', () => {
		expect(
			findShapeRegistrations(
				'plugins/x/src/lib/tools/c.tool.ts',
				'\tinputSchema: someInputSchema,\n\toutputSchema: someOutputSchema,',
			),
		).toEqual([]);
	});

	it('does not flag an unrelated `.shape` property access', () => {
		expect(
			findShapeRegistrations(
				'plugins/x/src/lib/tools/d.tool.ts',
				'const keys = Object.keys(someSchema.shape);',
			),
		).toEqual([]);
	});
});
