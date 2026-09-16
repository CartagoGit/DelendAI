import { describe, expect, it } from 'vitest';

import {
	findOkEnvelopeViolations,
	topLevelKeys,
} from './tool-ok-envelope.script';

const registration = (schema: string, answer: string): string =>
	[
		'server.registerTool(',
		"\t'demo_tool',",
		'\t{',
		`\t\toutputSchema: ${schema},`,
		'\t},',
		'\tasync () => {',
		`\t\treturn ${answer};`,
		'\t},',
		');',
	].join('\n');

describe('tool-ok-envelope — pure engine', () => {
	it('flags an inline schema that never declares ok', () => {
		const body = registration(
			'z.object({ storms: z.array(z.string()) })',
			'toolOk({ storms: [] })',
		);
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(1);
	});

	it('accepts an inline schema that declares ok', () => {
		const body = registration(
			'z.object({ ok: z.boolean(), storms: z.array(z.string()) })',
			'toolOk({ storms: [] })',
		);
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	it('accepts a payload wrapped in withOkEnvelope', () => {
		const body = registration(
			'withOkEnvelope(PAYLOAD_SCHEMA)',
			'toolOk({ storms: [] })',
		);
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	it('resolves a named schema declared in the same file', () => {
		const body = [
			'const OUT = z.object({ storms: z.array(z.string()) });',
			registration('OUT', 'toolOk({ storms: [] })'),
		].join('\n');
		const findings = findOkEnvelopeViolations('a.ts', body);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.schema).toBe('OUT');
	});

	it('accepts a named schema that declares ok', () => {
		const body = [
			'const OUT = z.object({ ok: z.boolean(), storms: z.array(z.string()) });',
			registration('OUT', 'toolOk({ storms: [] })'),
		].join('\n');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	it('accepts a loose schema, which cannot reject an undeclared key', () => {
		const body = registration(
			'compactOutputSchema()',
			'toolOk({ anything: 1 })',
		);
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	/**
	 * The regression this lint was rewritten for. The big multi-tool files
	 * register a dozen tools side by side; one of them answering with
	 * `toolOk` says nothing about the schema of another that answers with
	 * `toolJson`, which adds no `ok` and whose strict schema is correct.
	 * Judging the file rather than the registration reported three
	 * innocent tools.
	 */
	it('does not implicate a toolJson registration beside a toolOk one', () => {
		const body = [
			registration('z.object({ ok: z.boolean() })', 'toolOk({})'),
			registration(
				'z.object({ proposals: z.array(z.string()) })',
				'toolJson({ proposals: [] })',
			),
		].join('\n');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	it('does not judge a schema it cannot resolve in this file', () => {
		const body = registration('IMPORTED_SCHEMA', 'toolOk({})');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	it('ignores a file with no toolOk at all', () => {
		const body = registration(
			'z.object({ proposals: z.array(z.string()) })',
			'toolJson({ proposals: [] })',
		);
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	/**
	 * The shape both commit-policy tools actually had, and the reason the
	 * first per-registration version of this lint reported nothing: the
	 * registration delegates, and the `toolOk` call lives in the function
	 * it delegates to, declared above it.
	 */
	it('follows a handler that delegates to a function declared in the same file', () => {
		const body = [
			'const runTheTool = async () => {',
			'\treturn toolOk({ storms: [] });',
			'};',
			'const OUT = z.object({ storms: z.array(z.string()) });',
			'server.registerTool(',
			"\t'demo_tool',",
			'\t{',
			'\t\toutputSchema: OUT,',
			'\t},',
			'\tasync () => runTheTool(),',
			');',
		].join('\n');
		const findings = findOkEnvelopeViolations('a.ts', body);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.schema).toBe('OUT');
	});

	it('does not implicate a delegating handler whose function answers with toolJson', () => {
		const body = [
			'const runTheTool = async () => {',
			'\treturn toolJson({ proposals: [] });',
			'};',
			'const OUT = z.object({ proposals: z.array(z.string()) });',
			'const other = async () => toolOk({});',
			'server.registerTool(',
			"\t'demo_tool',",
			'\t{',
			'\t\toutputSchema: OUT,',
			'\t},',
			'\tasync () => runTheTool(),',
			');',
		].join('\n');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	/**
	 * `commit_policy_status` declared `ok` deep inside `branchPolicy.remote`
	 * and nowhere at the top level. A flat search for `ok:` read that as
	 * compliant and missed a tool that really was rejecting its own
	 * successful answer.
	 */
	it('is not fooled by an ok nested in a sub-object', () => {
		const body = [
			'const OUT = z.object({',
			'\tbranchPolicy: z.object({',
			'\t\tremote: z.object({ ok: z.boolean(), state: z.string() }),',
			'\t}),',
			'});',
			'server.registerTool(',
			"\t'demo_tool',",
			'\t{',
			'\t\toutputSchema: OUT,',
			'\t},',
			'\tasync () => toolOk({}),',
			');',
		].join('\n');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(1);
	});

	it('accepts an ok declared at the top level beside a nested one', () => {
		const body = [
			'const OUT = z.object({',
			'\tok: z.boolean(),',
			'\tbranchPolicy: z.object({ remote: z.object({ ok: z.boolean() }) }),',
			'});',
			'server.registerTool(',
			"\t'demo_tool',",
			'\t{',
			'\t\toutputSchema: OUT,',
			'\t},',
			'\tasync () => toolOk({}),',
			');',
		].join('\n');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	/**
	 * The shape that made this lint report an innocent tool. `close-plan`
	 * writes `// real-close variant` between two top-level fields, and the
	 * key right after a comment was being dropped — so its declared `ok`
	 * was invisible.
	 */
	it('sees a top-level key that follows a comment', () => {
		const body = [
			'const OUT = z.object({',
			'\tnote: z.string().optional(),',
			'\t// real-close variant',
			'\tok: z.boolean().optional(),',
			'\tplanId: z.string().optional(),',
			'});',
			'server.registerTool(',
			"\t'demo_tool',",
			'\t{',
			'\t\toutputSchema: OUT,',
			'\t},',
			'\tasync () => toolOk({}),',
			');',
		].join('\n');
		expect(findOkEnvelopeViolations('a.ts', body)).toHaveLength(0);
	});

	it('lists only outermost keys, comments and nesting notwithstanding', () => {
		const schema = [
			'({',
			'\ta: z.string(),',
			'\t/* block */',
			'\tb: z.object({ hidden: z.string() }),',
			'\t// line',
			'\tc: z.boolean(),',
			'})',
		].join('\n');
		expect([...topLevelKeys(schema)]).toEqual(['a', 'b', 'c']);
	});
});
