/**
 * dispatch-port-refusal.spec.ts — the safety property behind lazy
 * dispatch-port resolution.
 *
 * The original defect was that a missing port silently fell back to
 * `FakeDispatchPort`, whose canned clean response made the dispatcher
 * report fabricated success. Resolving the port at call time keeps the
 * port-independent tools (`_plan`, `_budget`) available while an actual
 * `_dispatch` refuses loudly.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { dispatchPortRefusal } from '../../../../src/lib/tools/dispatch.tool.js';
import {
	InvalidDispatchPortFactoryError,
	MissingDispatchPortError,
	resolveDispatchPort,
} from '../../../../src/lib/dispatch/port-resolution.helper.js';

/** Validates the envelope instead of asserting into `unknown` with a cast. */
const RefusalSchema = z.object({
	error: z.object({ reason: z.string(), nextAction: z.string() }),
});

const refusalOf = (
	refusal: ReturnType<typeof dispatchPortRefusal>,
): { reason: string; nextAction: string } => {
	expect(refusal?.isError).toBe(true);
	return RefusalSchema.parse(refusal?.structuredContent).error;
};

describe('dispatchPortRefusal', () => {
	it('refuses a missing dispatch port with an actionable next action', () => {
		const error = refusalOf(
			dispatchPortRefusal(new MissingDispatchPortError()),
		);
		expect(error.reason).toMatch(/fabricate success/i);
		expect(error.nextAction).toMatch(/portFactory/);
	});

	it('refuses a factory that produced something without spawnSubagent', () => {
		const error = refusalOf(
			dispatchPortRefusal(
				new InvalidDispatchPortFactoryError('missing spawnSubagent'),
			),
		);
		expect(error.nextAction).toMatch(/portFactory/);
	});

	it('lets an unrelated error keep propagating', () => {
		expect(dispatchPortRefusal(new Error('disk on fire'))).toBeUndefined();
	});

	it('is reached by the real resolver when no port is configured', () => {
		// Ties the pure refusal above to the resolution path the tool
		// actually calls, so the two cannot drift apart.
		let caught: unknown;
		try {
			resolveDispatchPort({});
		} catch (err) {
			caught = err;
		}
		expect(refusalOf(dispatchPortRefusal(caught)).nextAction).toMatch(
			/portFactory/,
		);
	});
});
