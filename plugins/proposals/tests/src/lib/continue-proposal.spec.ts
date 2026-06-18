import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runContinueProposal,
	type IContinueProposalToolOptions,
} from '@mcp-vertex/proposals/lib/tools/continue-proposal.tool';

const parse = (result: { content: Array<{ text: string }> }): any =>
	JSON.parse(result.content[0]?.text ?? '{}');

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
			})
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
			JSON.stringify({ proposals: [{ id: 'p1', file: 'p1.md', status: 'done' }] })
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
			})
		);
		writeFileSync(
			options.lockPathAbs,
			JSON.stringify({ in_flight: [{ task_id: 'f1-fix-slice-1', agent: 'falcon' }] })
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
			})
		);
		writeFileSync(
			options.lockPathAbs,
			JSON.stringify({ in_flight: [{ task_id: 'f1-fix', agent: 'owl' }] })
		);
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('all-claimed');
		expect(out.nextAction).toContain('Do NOT retry');
	});
});
