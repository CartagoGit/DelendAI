import { describe, expect, it } from 'vitest';

import { SCORE_DIMENSIONS } from '../../../../src/lib/services/audit-brief.service';
import { buildPlanRegistration } from '../../../../src/lib/tools/audit-plan.tool';

/** Invoke a registration's handler against a minimal fake MCP server. */
const invoke = async (
	reg: ReturnType<typeof buildPlanRegistration>,
	args: unknown,
): Promise<{ content: Array<{ text: string }> }> => {
	let handler:
		| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await reg.register({
		registerTool: (
			_name: string,
			_desc: unknown,
			fn: typeof handler,
		): void => {
			handler = fn;
		},
	} as never);
	if (!handler) throw new Error('audit_plan did not register a handler');
	return handler(args);
};

const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

// x00165 (S-B): `buildPlanRegistration`'s own doc comment already
// promised "when omitted, falls back to SCORE_DIMENSIONS (canonical)"
// — but the actual fallback was a stale, dead Spanish translation of
// that same list, only ever reachable when a direct caller (bypassing
// `index.ts`, which always supplies `dimensions`) omits the option.
describe('buildPlanRegistration — dimensions fallback (x00165)', () => {
	it('falls back to the canonical English SCORE_DIMENSIONS when dimensions is omitted', async () => {
		const reg = buildPlanRegistration({ namespacePrefix: 'audit' });
		const out = parse(await invoke(reg, {}));
		expect(out.dimensions).toEqual([...SCORE_DIMENSIONS]);
		expect(out.dimensions).not.toContain('Arquitectura');
		expect(out.dimensions).not.toContain('Genericidad');
	});

	it('renders and returns the requested audit type', async () => {
		const reg = buildPlanRegistration({ namespacePrefix: 'audit' });
		const out = parse(await invoke(reg, { auditType: 'plan' }));

		expect(out.detail).toBe('normal');
		expect(out.auditType).toBe('plan');
		expect(out.markdown).toContain('type plan');
		expect(out.markdown).toContain('implementation plan');
	});

	it('supports compact detail by omitting the generated markdown body', async () => {
		const reg = buildPlanRegistration({ namespacePrefix: 'audit' });
		const out = parse(await invoke(reg, { detail: 'compact' }));

		expect(out.detail).toBe('compact');
		expect(out.markdown).toBe('');
		expect(out.scope).toBe('full');
		expect(out.dimensions).toEqual([...SCORE_DIMENSIONS]);
	});
});
