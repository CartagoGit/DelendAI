/**
 * no-silent-gates.script.spec.ts — a gate that fails says why (q00014 S7).
 */
import { describe, expect, it } from 'vitest';

import { lintScriptSource } from './no-silent-gates.script';

describe('lintScriptSource', () => {
	it('flags a gate that can exit non-zero and never writes anything', () => {
		const violations = lintScriptSource(
			'tools/scripts/lint/quiet.script.ts',
			'const ok = check();\nif (!ok) process.exit(1);\n',
		);
		expect(violations.map((v) => v.rule)).toEqual(['silent-exit']);
		expect(violations[0]?.line).toBe(2);
	});

	it('flags a failing branch whose scope prints nothing', () => {
		const violations = lintScriptSource(
			'tools/scripts/lint/half.script.ts',
			[
				'const guard = () => {',
				'\tif (broken()) {',
				'\t\tprocess.exit(1);',
				'\t}',
				'};',
				'const report = () => {',
				"\tconsole.error('bad');",
				'};',
			].join('\n'),
		);
		expect(violations.map((v) => v.rule)).toContain(
			'silent-failure-branch',
		);
	});

	it('accepts a gate that prints its diagnosis before exiting', () => {
		expect(
			lintScriptSource(
				'tools/scripts/lint/loud.script.ts',
				"if (!check()) {\n\tconsole.error('what failed, and the fix');\n\tprocess.exit(1);\n}\n",
			),
		).toEqual([]);
	});
});
