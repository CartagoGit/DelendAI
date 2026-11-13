import { describe, expect, it } from 'vitest';

import {
	attestedSlices,
	attestImplementer,
} from '../../../../src/lib/services/attested-implementer.service';
import { unapprovedSlices } from '../../../../src/lib/shared/independent-approval';

const PROPOSAL = `# p1

## slices

### S1 — Named by Git

- **Status**: done
- review-state: done
- review-implementer: alpha
- review-reviewer: beta
- review-log: approved by beta — verified at abc
- review-attribution: alpha from commit abc names refs/heads/x (abc), opened by beta

### S2 — Nobody could be named

- **Status**: done
- review-state: done
- review-implementer: unrecorded
- review-reviewer: beta
- review-log: approved by beta — verified at def
- review-attribution: unrecorded — nothing in Git names who delivered def; independence could not be verified, opened by beta

### S3 — Never reviewed

- **Status**: review

## notes
`;

const attestation = {
	implementer: 'gamma',
	attestedBy: 'delta',
	evidence: 'the session record of 2026-09-15 shows gamma making the commit',
};

describe('attestImplementer', () => {
	it('names the implementer of an unrecorded slice and says where the name comes from', () => {
		const result = attestImplementer(PROPOSAL, 'S2', attestation);
		if (!result.ok) throw new Error(result.reason);
		expect(result.markdown).toContain('- review-implementer: gamma\n');
		expect(result.markdown).toContain(
			'- review-attribution: gamma attested by delta — the session record of 2026-09-15 shows gamma making the commit',
		);
		expect(result.markdown).not.toContain('review-implementer: unrecorded');
		// The reviewer's own lines are as they were.
		expect(result.markdown).toContain(
			'- review-log: approved by beta — verified at def',
		);
		// And nothing outside the slice moved.
		expect(result.markdown).toContain('- review-implementer: alpha\n');
		expect(result.markdown.endsWith('## notes\n')).toBe(true);
	});

	it('lets a slice approved by somebody else reach done once it is attested', () => {
		expect(unapprovedSlices(PROPOSAL)).toEqual([
			'S2 — Nobody could be named',
		]);
		const result = attestImplementer(PROPOSAL, 's2', attestation);
		if (!result.ok) throw new Error(result.reason);
		expect(unapprovedSlices(result.markdown)).toEqual([]);
	});

	it('does not let an attestation make an approval its own', () => {
		const result = attestImplementer(PROPOSAL, 'S2', {
			...attestation,
			implementer: 'beta',
		});
		if (!result.ok) throw new Error(result.reason);
		expect(unapprovedSlices(result.markdown)).toEqual([
			'S2 — Nobody could be named',
		]);
	});

	it('refuses the Git author of the delivering commit, which every agent here shares', () => {
		const result = attestImplementer(PROPOSAL, 'S2', {
			...attestation,
			implementer: 'Cartago',
			deliveredBy: ['Cartago', 'owner@example.test'],
		});
		expect(result.ok).toBe(false);
		expect(result.ok ? '' : result.reason).toContain('Git author');
		expect(
			attestImplementer(PROPOSAL, 'S2', {
				...attestation,
				deliveredBy: ['Cartago'],
			}).ok,
		).toBe(true);
	});

	it('refuses a slice Git or a submitter already names', () => {
		const result = attestImplementer(PROPOSAL, 'S1', attestation);
		expect(result).toMatchObject({ ok: false });
		expect(!result.ok && result.reason).toContain(
			'already names its implementer, alpha',
		);
	});

	it('refuses a slice no review round was opened for, and one it cannot find', () => {
		expect(attestImplementer(PROPOSAL, 'S3', attestation)).toMatchObject({
			ok: false,
		});
		expect(attestImplementer(PROPOSAL, 'S9', attestation)).toMatchObject({
			ok: false,
			reason: 'slice "S9" was not found',
		});
	});

	it('refuses a name that is no name and evidence that is no evidence', () => {
		for (const implementer of ['', 'unrecorded', 'two words']) {
			expect(
				attestImplementer(PROPOSAL, 'S2', {
					...attestation,
					implementer,
				}).ok,
			).toBe(false);
		}
		expect(
			attestImplementer(PROPOSAL, 'S2', {
				...attestation,
				evidence: 'trust me',
			}).ok,
		).toBe(false);
	});
});

describe('attestedSlices', () => {
	it('is empty for a proposal Git names throughout', () => {
		expect(attestedSlices(PROPOSAL)).toEqual([]);
	});

	it('names the slices closed on an attestation', () => {
		const result = attestImplementer(PROPOSAL, 'S2', attestation);
		if (!result.ok) throw new Error(result.reason);
		expect(attestedSlices(result.markdown)).toEqual([
			'S2 — Nobody could be named',
		]);
	});
});
