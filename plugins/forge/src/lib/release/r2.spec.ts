import { describe, expect, it } from 'vitest';

import { validateReleaseReadiness } from './index';
import type { IReleaseCandidateMetadata } from '@delendai/core/public';

const SOURCE_SHA = 'abcdefa';
const MAIN_SHA = 'abcdefb';
const FROM_VERSION = '1.4.2';
const TARGET_VERSION = '1.4.3';
const TEST_TIMESTAMP = new Date(0).toISOString();

const candidate: IReleaseCandidateMetadata = {
	sourceDevelopSha: SOURCE_SHA,
	baseMainSha: MAIN_SHA,
	fromVersion: FROM_VERSION,
	targetVersion: TARGET_VERSION,
	type: 'patch',
	slug: 'r2-readiness',
	branch: 'release/patch/r2-readiness',
	actor: 'agent',
	timestamp: TEST_TIMESTAMP,
	includedProposals: [],
	state: 'cut',
};

describe('release R2 forge readiness', () => {
	it('rejects a failed required gate', () => {
		expect(() =>
			validateReleaseReadiness(candidate, [
				{ name: 'tests', status: 'failed' },
			]),
		).toThrowError(expect.objectContaining({ code: 'readiness-blocked' }));
	});

	it('accepts passed required gates and ignores optional failures', () => {
		expect(
			validateReleaseReadiness(candidate, [
				{ name: 'tests', status: 'passed' },
				{ name: 'docs', status: 'failed', required: false },
			]),
		).toMatchObject({ ready: true });
	});
});
