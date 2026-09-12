/**
 * classification.spec.ts — the fail-closed table itself.
 *
 * The catalogue is the whole safety argument of this subsystem, so it is
 * asserted directly rather than only through the boot: a code nobody
 * registered must classify as AMBIGUOUS, the two lists must not overlap,
 * and a repair task id must depend only on the code and the subject so
 * that re-observing an ambiguity does not create a second task.
 *
 * The ref parser is here for the same reason: it decides which refs can
 * be attributed at all, and the shipped template's `-` separators are
 * exactly where a lazy regex would silently mis-split an identity.
 */

import { describe, expect, it } from 'vitest';

import {
	AMBIGUOUS_FINDING_CODES,
	classifyFinding,
	compileWorkRefParser,
	isRegisteredSafeRepair,
	needsRepairTask,
	repairTaskId,
	SAFE_FINDING_CODES,
} from '@delendai/core/lib/startup-reconciler/index';

describe('finding classification', () => {
	it('treats an unregistered code as ambiguous, never as safe', () => {
		expect(classifyFinding('something.nobody.registered')).toBe(
			'ambiguous',
		);
		expect(isRegisteredSafeRepair('something.nobody.registered')).toBe(
			false,
		);
		expect(needsRepairTask('something.nobody.registered')).toBe(true);
	});

	it('keeps the safe and ambiguous lists disjoint', () => {
		const safe = new Set<string>(SAFE_FINDING_CODES);
		for (const code of AMBIGUOUS_FINDING_CODES) {
			expect(safe.has(code)).toBe(false);
			expect(classifyFinding(code)).toBe('ambiguous');
		}
		for (const code of SAFE_FINDING_CODES) {
			expect(classifyFinding(code)).toBe('safe');
			expect(needsRepairTask(code)).toBe(false);
		}
	});

	it('does not generate repair work for a merely unverified condition', () => {
		expect(needsRepairTask('fetch.failed')).toBe(false);
		expect(needsRepairTask('mutex.busy')).toBe(false);
	});

	it('derives a repair task id from the code and the subject alone', () => {
		expect(repairTaskId('work-refs.duplicate-generation', 'a + b')).toBe(
			repairTaskId('work-refs.duplicate-generation', 'a + b'),
		);
		expect(
			repairTaskId('work-refs.duplicate-generation', 'a + b'),
		).not.toBe(repairTaskId('work-refs.duplicate-generation', 'a + c'));
	});
});

describe('work ref parsing', () => {
	const parser = compileWorkRefParser(
		'wip/${agent}/${proposal}-${slice}-g${generation}',
		'wip/',
	);

	it('recovers the four-part identity from a ref the engine wrote', () => {
		expect(parser?.namespace).toBe('refs/wip');
		expect(parser?.parse('refs/wip/agent-a/f00065-s3-g7')).toEqual({
			agent: 'agent-a',
			proposal: 'f00065',
			slice: 's3',
			generation: 7,
		});
	});

	it('returns undefined for a ref that encodes no identity', () => {
		expect(parser?.parse('refs/wip/mystery')).toBeUndefined();
		expect(parser?.parse('refs/heads/develop')).toBeUndefined();
		expect(parser?.parse('refs/wip/agent-a/f1-s1-gX')).toBeUndefined();
	});

	it('has nothing to parse when the policy manages no work refs', () => {
		expect(compileWorkRefParser('', '')).toBeUndefined();
	});
});
