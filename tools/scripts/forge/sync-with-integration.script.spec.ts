/**
 * The only sync decision that can lose work.
 *
 * Three of the four states are harmless. The fourth — a local
 * integration branch that is behind AND carries commits of its own — is
 * the one where "just sync it" means "throw those commits away", and it
 * is indistinguishable from `fast-forward` unless the ahead count is
 * looked at. These cases exist so it stays distinguishable.
 */

import { describe, expect, it } from 'vitest';

import {
	localSyncVerdict,
	syncExplanation,
} from './sync-with-integration.script';

describe('localSyncVerdict', () => {
	it('has nothing to do when the counts are both zero', () => {
		expect(localSyncVerdict({ ahead: 0, behind: 0 })).toBe(
			'already-current',
		);
	});

	it('advances a branch that is only behind', () => {
		expect(localSyncVerdict({ ahead: 0, behind: 7 })).toBe('fast-forward');
	});

	it('pulls nothing into a branch that is only ahead', () => {
		expect(localSyncVerdict({ ahead: 2, behind: 0 })).toBe('ahead');
	});

	it('refuses a branch that is behind AND carries its own commits', () => {
		expect(localSyncVerdict({ ahead: 1, behind: 9 })).toBe('diverged');
	});

	it('calls one local commit divergence, not a rounding error', () => {
		expect(localSyncVerdict({ ahead: 1, behind: 1 })).toBe('diverged');
	});
});

describe('syncExplanation', () => {
	it('says how many commits would be lost when it refuses', () => {
		expect(
			syncExplanation('diverged', 'develop', { ahead: 3, behind: 4 }),
		).toContain('3 commit(s) of its own');
	});

	it('names the branch it is talking about', () => {
		expect(
			syncExplanation('fast-forward', 'trunk', { ahead: 0, behind: 1 }),
		).toContain('trunk');
	});
});
