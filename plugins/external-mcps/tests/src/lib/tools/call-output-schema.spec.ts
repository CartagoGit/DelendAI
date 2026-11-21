/**
 * call-output-schema.spec.ts — every code external_mcp_call can answer with
 * is one its outputSchema admits.
 *
 * The call answers a refused or failed call as a success result
 * (`ok: false` with a code), so a client that listed tools validates it
 * against the schema: a code missing from the enum turned a clear
 * `missing-env` into a -32602 schema error.
 */
import { describe, expect, it } from 'vitest';

import {
	ACTIVATION_DENIAL_CODES,
	EXTERNAL_CALL_FAILURE_CODES,
} from '@delendai/external-mcps/lib/contracts/constants/call-failure-codes.constant';
import { CallOutputSchema } from '@delendai/external-mcps/lib/tools/invoke-proxy';

describe('external_mcp_call output schema', () => {
	it('admits every activation denial and every registry failure code', () => {
		for (const code of [
			...ACTIVATION_DENIAL_CODES,
			...EXTERNAL_CALL_FAILURE_CODES,
		])
			expect(
				CallOutputSchema.safeParse({ ok: false, code, hint: 'h' })
					.success,
			).toBe(true);
	});

	it('admits missing-env, the code the registry returned and the schema refused', () => {
		expect(
			CallOutputSchema.safeParse({
				ok: false,
				code: 'missing-env',
				hint: 'set FOO',
			}).success,
		).toBe(true);
	});
});
