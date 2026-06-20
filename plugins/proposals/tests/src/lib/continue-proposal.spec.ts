import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runContinueProposal,
	type IContinueProposalToolOptions,
} from '@mcp-vertex/proposals/lib/tools/continue-proposal.tool';

// The tool declares an `outputSchema`, so the MCP SDK requires
// `structuredContent` on every response — a text-only payload throws
// "Output validation error" at the transport layer (caught the hard way
// when `mode:"auto"` had no actionable proposal). Assert it here so any
// branch that regresses to text-only fails the suite, not just runtime.
const parse = (result: {
	content: Array<{ text: string }>;
	structuredContent?: unknown;
}): any => {
	const value = JSON.parse(result.content[0]?.text ?? '{}');
	expect(result.structuredContent).toEqual(value);
	return value;
};

describe('continue_proposal (serial cascade)', () => {
	let root = '';
	let options: IContinueProposalToolOptions;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'continue-'));
		const indexPath = join(root, 'index.json');
		writeFileSync(
			indexPath,
			JSON.stringify({
				proposals: [
					{ id: 'p2-second', file: 'p2.md', status: 'pending' },
					{ id: 'f1-fix', file: 'f1.md', status: 'pending' },
					{ id: 'p1-done', file: 'p1.md', status: 'done' },
				],
			}),
		);
		options = {
			namespacePrefix: 'proposals',
			indexPathAbs: indexPath,
			lockPathAbs: join(root, 'lock.json'),
		};
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('returns the next actionable proposal, fixes (f) before proposals (p)', async () => {
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('next-proposal');
		expect(out.proposalId).toBe('f1-fix');
	});

	it('reports no-proposal when nothing is actionable', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [{ id: 'p1', file: 'p1.md', status: 'done' }],
			}),
		);
		const out = parse(await runContinueProposal({}, options));
		expect(out.kind).toBe('no-proposal');
	});

	it('errors clearly when a slice mode is used without a proposalId', async () => {
		const out = parse(await runContinueProposal({ mode: 'plan' }, options));
		expect(out.kind).toBe('slice-mode-error');
	});

	it('skips in_progress proposals locked by another agent (anti-loop) [N9]', async () => {
		// f1 is in_progress AND locked → must not be re-selected; p2 (free) wins.
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{ id: 'f1-fix', file: 'f1.md', status: 'in_progress' },
					{ id: 'p2-second', file: 'p2.md', status: 'pending' },
				],
			}),
		);
		writeFileSync(
			options.lockPathAbs,
			JSON.stringify({
				in_flight: [{ task_id: 'f1-fix-slice-1', agent: 'falcon' }],
			}),
		);
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('next-proposal');
		expect(out.proposalId).toBe('p2-second');
	});

	it('returns all-claimed (no loop) when every actionable proposal is locked [N9]', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{ id: 'f1-fix', file: 'f1.md', status: 'in_progress' },
				],
			}),
		);
		writeFileSync(
			options.lockPathAbs,
			JSON.stringify({
				in_flight: [{ task_id: 'f1-fix', agent: 'owl' }],
			}),
		);
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('all-claimed');
		expect(out.nextAction).toContain('Do NOT retry');
	});

	// f113 S4: new-system entries (id prefix is one of the 12 live kinds,
	// status is one of the 7 glossary statuses) are actionable by FOLDER
	// (derived from the index `file` path), not by status string.
	describe('folder-aware cascade for new-system (f113) entries', () => {
		it('picks a new-system entry living in ready/', async () => {
			writeFileSync(
				options.indexPathAbs,
				JSON.stringify({
					proposals: [
						{
							id: 'f200',
							file: 'ready/f200-x.md',
							status: 'ready',
						},
					],
				}),
			);
			const out = parse(
				await runContinueProposal({ mode: 'auto' }, options),
			);
			expect(out.kind).toBe('next-proposal');
			expect(out.proposalId).toBe('f200');
		});

		it('respects (does not re-pick away from) an entry already in review/, even though "review" is not in the legacy ACTIONABLE set', async () => {
			writeFileSync(
				options.indexPathAbs,
				JSON.stringify({
					proposals: [
						{
							id: 'f201',
							file: 'review/f201-x.md',
							status: 'review',
						},
					],
				}),
			);
			const out = parse(
				await runContinueProposal({ mode: 'auto' }, options),
			);
			expect(out.kind).toBe('next-proposal');
			expect(out.proposalId).toBe('f201');
		});

		it.each([
			'paused',
			'blocked',
			'done',
			'retired',
		])('skips a new-system entry living in %s/', async (folder) => {
			writeFileSync(
				options.indexPathAbs,
				JSON.stringify({
					proposals: [
						{
							id: 'f202',
							file: `${folder}/f202-x.md`,
							status: folder,
						},
					],
				}),
			);
			const out = parse(
				await runContinueProposal({ mode: 'auto' }, options),
			);
			expect(out.kind).toBe('no-proposal');
		});

		it('never reclassifies a legacy (p-prefixed) entry as new-system even when its status+folder match the glossary', async () => {
			// Same shape as a real new-system "ready" entry, but the id keeps
			// the retired legacy prefix `p` — must still fall through to the
			// legacy status-string check (and "ready" IS in the legacy
			// ACTIONABLE set too, so this stays actionable either way — the
			// point is which CODE PATH decided that, verified indirectly via
			// the folder-skip case below, which would NOT skip a legacy id).
			writeFileSync(
				options.indexPathAbs,
				JSON.stringify({
					proposals: [
						{
							id: 'p203',
							file: 'blocked/p203-x.md',
							status: 'ready',
						},
					],
				}),
			);
			const out = parse(
				await runContinueProposal({ mode: 'auto' }, options),
			);
			// Legacy path looks at `status` ("ready" → actionable), not the
			// folder — so a legacy id stuck in blocked/ by some accident is
			// still picked, unlike a real new-system entry (see the %s/ test
			// above, which correctly skips it).
			expect(out.kind).toBe('next-proposal');
			expect(out.proposalId).toBe('p203');
		});
	});
});
