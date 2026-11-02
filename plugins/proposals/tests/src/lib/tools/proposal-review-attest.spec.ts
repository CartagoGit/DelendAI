/**
 * proposal-review-attest.spec.ts — a slice Git cannot name is attested on
 * the record, and only such a slice.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { unapprovedSlices } from '../../../../src/lib/shared/independent-approval';
import { createReviewRepo, EVIDENCE, type IReviewRepo } from './review-repo';

let repo: IReviewRepo;

beforeEach(() => {
	repo = createReviewRepo();
});

afterEach(() => {
	repo.cleanup();
});

const EVIDENCE_NOTE =
	'the session record of the day shows agent-a making this commit';

/** A delivery no ref, merge or trailer names, approved by agent-b. */
const unnamedDelivery = async (): Promise<string> => {
	writeFileSync(join(repo.root, 'src/a.ts'), 'export const a = 1;\n');
	repo.git('add', 'src/a.ts');
	repo.git('commit', '-q', '--no-verify', '-m', 'feat: the work');
	const commit = repo.git('rev-parse', 'HEAD');
	const path = repo.proposalInReview(`### S1 — the work
- **Status**: review
- **Files**: \`src\`
`);
	const approved = await repo.review({
		action: 'approve',
		agent: 'agent-b',
		evidence: { ...EVIDENCE, commitHash: commit.slice(0, 9) },
	});
	expect(approved.isError).toBe(false);
	return path;
};

describe('proposal_review attest', () => {
	it('names who delivered an unrecorded slice, and the approval then counts', async () => {
		const path = await unnamedDelivery();
		expect(readFileSync(path, 'utf8')).toContain(
			'review-implementer: unrecorded',
		);
		expect(unapprovedSlices(readFileSync(path, 'utf8'))).toHaveLength(1);

		const attested = await repo.review({
			action: 'attest',
			agent: 'agent-c',
			implementer: 'agent-a',
			note: EVIDENCE_NOTE,
		});

		expect(attested.isError).toBe(false);
		expect(attested.body).toMatchObject({
			action: 'attest',
			implementer: 'agent-a',
			reviewer: 'agent-b',
		});
		const after = readFileSync(path, 'utf8');
		expect(after).toContain(
			`- review-attribution: agent-a attested by agent-c — ${EVIDENCE_NOTE}`,
		);
		expect(after).toContain('approved by agent-b');
		expect(unapprovedSlices(after)).toEqual([]);
	});

	it('refuses without a name, or without evidence a reader can check', async () => {
		const path = await unnamedDelivery();
		const before = readFileSync(path, 'utf8');
		for (const args of [
			{ note: EVIDENCE_NOTE },
			{ implementer: 'agent-a', note: 'trust me' },
			{ implementer: 'agent-a' },
		]) {
			const refused = await repo.review({
				action: 'attest',
				agent: 'agent-c',
				...args,
			});
			expect(refused.isError).toBe(true);
			expect(refused.text).toContain('attestation-refused');
		}
		expect(readFileSync(path, 'utf8')).toBe(before);
	});

	it('refuses a slice whose implementer is already named', async () => {
		const path = await unnamedDelivery();
		await repo.review({
			action: 'attest',
			agent: 'agent-c',
			implementer: 'agent-a',
			note: EVIDENCE_NOTE,
		});
		const again = await repo.review({
			action: 'attest',
			agent: 'agent-d',
			implementer: 'agent-b',
			note: EVIDENCE_NOTE,
		});
		expect(again.isError).toBe(true);
		expect(again.text).toContain('already names its implementer, agent-a');
		expect(readFileSync(path, 'utf8')).not.toContain('attested by agent-d');
	});
});
