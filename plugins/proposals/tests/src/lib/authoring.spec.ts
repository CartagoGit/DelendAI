import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildCloseSliceRegistration,
	buildCreateProposalRegistration,
	buildProposalBoardRegistration,
	buildReviewRegistration,
	type IAuthoringToolOptions,
} from '@mcp-vertex/proposals/lib/tools/authoring.tool';

const capture = async (
	reg: IToolRegistration,
): Promise<(a: unknown) => Promise<{ content: Array<{ text: string }> }>> => {
	let h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h!;
};
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

describe('proposal authoring (create → board → close)', () => {
	let root = '';
	let opts: IAuthoringToolOptions;
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'authoring-'));
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
			indexPathAbs: join(root, 'docs/mcp-vertex/proposals/index.json'),
			lockPathAbs: join(root, '.cache/agents.lock.json'),
			counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		};
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	// f113 S13: id is now optional — omit it and pass `kind` to get a
	// race-safe allocated id instead.
	it('allocates an id from kind when id is omitted', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({ kind: 'feat', title: 'Auto allocated' }),
		);
		expect(created.ok).toBe(true);
		expect(created.file).toBe('f1-auto-allocated.md');

		// A second call with the same kind continues the sequence, not f1 again.
		const second = parse(
			await create({ kind: 'feat', title: 'Second one' }),
		);
		expect(second.file).toBe('f2-second-one.md');
	});

	it('errors clearly when neither id nor kind is provided', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const result = await create({ title: 'No id, no kind' });
		expect(result).toMatchObject({ isError: true });
	});

	it('creates a proposal with disjoint slices, lists it on the board, and closes a slice', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'p1',
				title: 'Add login',
				goal: 'Login flow',
				slices: [
					{
						sliceId: 's1',
						files: ['src/a.ts'],
						acceptance: ['bun test'],
					},
					{ sliceId: 's2', files: ['src/b.ts'] },
				],
			}),
		);
		expect(created.ok).toBe(true);
		expect(created.file).toBe('p1-add-login.md');

		const board = await capture(buildProposalBoardRegistration(opts));
		const view = parse(await board({}));
		const p1 = view.proposals.find((p: { id: string }) => p.id === 'p1');
		expect(p1.slices.map((s: { sliceId: string }) => s.sliceId)).toEqual([
			's1',
			's2',
		]);
		expect(p1.claimableSliceIds).toContain('s1');

		const close = await capture(buildCloseSliceRegistration(opts));
		const closed = parse(
			await close({
				proposalId: 'p1',
				sliceId: 's1',
				releaseLock: false,
			}),
		);
		expect(closed.closed).toBe(true);
		const doc = readFileSync(
			join(opts.proposalsDirAbs, 'p1-add-login.md'),
			'utf8',
		);
		expect(doc).toMatch(/### s1[\s\S]*?- status: done/);
	});

	it('redacts secrets pasted into the goal before persisting (M23)', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const created = parse(
			await create({
				id: 'p3',
				title: 'Wire API',
				goal: 'Use api_key = "s3cr3tValue123" to call the service',
				slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
			}),
		);
		expect(created.ok).toBe(true);
		expect(created.redactedSecrets).toBeGreaterThan(0);
		const doc = readFileSync(
			join(opts.proposalsDirAbs, 'p3-wire-api.md'),
			'utf8',
		);
		expect(doc).not.toContain('s3cr3tValue123');
		expect(doc).toContain('[REDACTED]');
	});

	it('runs a peer-review loop: submit → request_changes (by another) → resubmit → approve → done (M35)', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'p4',
			title: 'Review me',
			goal: 'work',
			slices: [{ sliceId: 's1', files: ['src/a.ts'] }],
		});
		const review = await capture(buildReviewRegistration(opts));
		const file = join(opts.proposalsDirAbs, 'p4-review-me.md');

		// Implementer submits for review.
		const submitted = parse(
			await review({
				proposalId: 'p4',
				sliceId: 's1',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(submitted.status).toBe('in_review');
		expect(submitted.implementer).toBe('falcon');

		// The implementer cannot review their own work.
		const selfReview = parse(
			await review({
				proposalId: 'p4',
				sliceId: 's1',
				action: 'approve',
				agent: 'falcon',
			}),
		);
		expect(selfReview.ok).toBe(false);
		expect(selfReview.error.reason).toMatch(/different agent/i);

		// A different agent finds a fault.
		const changes = parse(
			await review({
				proposalId: 'p4',
				sliceId: 's1',
				action: 'request_changes',
				agent: 'eagle',
				note: 'add a test',
			}),
		);
		expect(changes.status).toBe('changes_requested');
		expect(readFileSync(file, 'utf8')).not.toMatch(/^- status: done/m);

		// Fixer resubmits; another agent approves the fix.
		const resubmitted = parse(
			await review({
				proposalId: 'p4',
				sliceId: 's1',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(resubmitted.status).toBe('in_review');
		const approved = parse(
			await review({
				proposalId: 'p4',
				sliceId: 's1',
				action: 'approve',
				agent: 'owl',
			}),
		);
		expect(approved.status).toBe('done');
		expect(approved.reviewer).toBe('owl');
		expect(
			approved.rounds.map((r: { verdict: string }) => r.verdict),
		).toEqual(['requested_changes', 'approved']);

		// The doc now carries the real done marker + the review log.
		const doc = readFileSync(file, 'utf8');
		expect(doc).toMatch(/^- status: done/m);
		expect(doc).toMatch(
			/review-log: requested_changes by eagle — add a test/,
		);
		expect(doc).toMatch(/review-log: approved by owl/);
	});

	it('targets the exact slice even when the sliceId has regex metacharacters', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		await create({
			id: 'p5',
			title: 'Meta',
			goal: 'work',
			// 'axb' first: an UNescaped /### a.b —/ would match it (`.`=`x`) — the
			// wrong block. The escape pins the match to the literal 'a.b'.
			slices: [
				{ sliceId: 'axb', files: ['src/b.ts'] },
				{ sliceId: 'a.b', files: ['src/a.ts'] },
			],
		});
		const review = await capture(buildReviewRegistration(opts));
		const r = parse(
			await review({
				proposalId: 'p5',
				sliceId: 'a.b',
				action: 'submit',
				agent: 'falcon',
			}),
		);
		expect(r.status).toBe('in_review');
		const doc = readFileSync(
			join(opts.proposalsDirAbs, 'p5-meta.md'),
			'utf8',
		);
		// The literal a.b block got the review line; the earlier axb block did NOT.
		const axbBlock = doc.slice(
			doc.indexOf('### axb'),
			doc.indexOf('### a.b'),
		);
		expect(axbBlock).not.toMatch(/review-state/);
		expect(doc.slice(doc.indexOf('### a.b'))).toMatch(
			/review-state: in_review/,
		);
	});

	it('rejects overlapping slices', async () => {
		const create = await capture(buildCreateProposalRegistration(opts));
		const out = parse(
			await create({
				id: 'p2',
				title: 'Bad',
				slices: [
					{ sliceId: 's1', files: ['x.ts'] },
					{ sliceId: 's2', files: ['x.ts'] },
				],
			}),
		);
		expect(out.ok).toBe(false);
		expect(out.error.reason).toMatch(/share files/);
	});
});
