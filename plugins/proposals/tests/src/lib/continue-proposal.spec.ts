import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runAgentLockEngine } from '@mcp-vertex/proposals/lib/locks/agent-lock-engine';
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

const parseTextOnly = (result: { content: Array<{ text: string }> }): any =>
	JSON.parse(result.content[0]?.text ?? '{}');

describe('continue_proposal (serial cascade)', async () => {
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

	it('skips a new-system entry whose document is missing on disk', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'x00183',
						file: 'ready/x00183-gone.md',
						status: 'ready',
						type: 'proposal',
					},
					{
						id: 'x00184',
						file: 'ready/x00184-alive.md',
						status: 'ready',
						type: 'proposal',
					},
				],
			}),
		);
		mkdirSync(join(root, 'ready'), { recursive: true });
		writeFileSync(
			join(root, 'ready/x00184-alive.md'),
			`---
id: x00184
status: ready
kind: fix
---

# x00184

## Slices

### S1 — next
- **Files**: \`src/alive.ts\`
- **Gate**: none
- **Status**: pending
`,
		);
		options = { ...options, proposalsDirAbs: root };
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('next-proposal');
		expect(out.proposalId).toBe('x00184');
	});

	it('treats by-kind ready subfolders as actionable', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'f200-ready-kind',
						file: 'ready/feats/f200-ready-kind.md',
						status: 'ready',
						type: 'proposal',
					},
				],
			}),
		);
		mkdirSync(join(root, 'ready/feats'), { recursive: true });
		writeFileSync(
			join(root, 'ready/feats/f200-ready-kind.md'),
			[
				'---',
				'id: f200-ready-kind',
				'status: ready',
				'kind: feat',
				'---',
				'',
				'# f200-ready-kind',
			].join('\n'),
		);
		options = { ...options, proposalsDirAbs: root };
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('next-proposal');
		expect(out.proposalId).toBe('f200-ready-kind');
	});

	it('applies cascadeOverride and reports its reason in cascadeTrace', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'x1-fix',
						file: 'x1.md',
						status: 'pending',
					},
					{
						id: 'f1-feature',
						file: 'f1.md',
						status: 'pending',
					},
				],
			}),
		);
		writeFileSync(
			join(root, 'f1.md'),
			[
				'---',
				'cascadeOverride: -5',
				'cascadeOverrideReason: urgent release train unblock',
				'---',
				'',
				'# f1',
			].join('\n'),
		);
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('next-proposal');
		expect(out.proposalId).toBe('f1-feature');
		expect(out.cascadeTrace).toEqual({
			priority: -5,
			cascadeOverrideReason: 'urgent release train unblock',
		});
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

	it('heals a stale index path via locate scan (a00069 S3)', async () => {
		const proposalsDir = join(root, 'proposals');
		mkdirSync(join(proposalsDir, 'done/feats'), { recursive: true });
		const md = [
			'---',
			'id: f00050',
			'status: done',
			'---',
			'',
			'# f00050',
			'',
			'## Slices',
			'',
			'### S1 — one',
			'',
			'- files: a.ts',
			'- status: done',
			'',
		].join('\n');
		// Index still points at ready/, file already lives under done/feats/.
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{
						id: 'f00050',
						file: 'ready/f00050-moved.md',
						status: 'done',
					},
				],
			}),
		);
		writeFileSync(join(proposalsDir, 'done/feats/f00050-moved.md'), md);
		const out = parse(
			await runContinueProposal(
				{ mode: 'plan', proposalId: 'f00050' },
				{
					...options,
					proposalsDirAbs: proposalsDir,
				},
			),
		);
		expect(out.kind).toBe('slice-plan');
		expect(out.proposalId ?? out.id).toBeDefined();
	});

	it('integrates migration ordering and worktree guidance into the real slice-plan flow', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{ id: 'r00044', file: 'r00044.md', status: 'ready' },
				],
			}),
		);
		writeFileSync(
			join(root, 'r00044.md'),
			[
				'---',
				'id: r00044',
				'---',
				'',
				'# r00044',
				'',
				'## Slices',
				'',
				'### S1 — expand',
				'- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'- migration_phase: expand',
				'- status: done',
				'',
				'### S2 — producers',
				'- files: plugins/proposals/src/lib/swarm/contract-migration-policy.ts',
				'- migration_phase: producers',
				'- status: done',
				'',
				'### S3 — regenerate',
				'- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'- migration_phase: regenerate',
				'- status: done',
				'',
				'### S4 — consumers',
				'- files: plugins/proposals/src/lib/swarm/proposal-slice-plan.ts',
				'- migration_phase: consumers',
				'- status: done',
				'',
				'### S5 — verify fanout',
				'- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'- files: plugins/proposals/src/lib/swarm/proposal-slice-plan.ts',
				'- files: plugins/proposals/src/lib/agents/agent-worktree-engine.ts',
				'- files: plugins/proposals/tests/src/lib/continue-proposal.spec.ts',
				'- migration_phase: verify',
				'- gate: type',
				'',
				'### S6 — contract cleanup',
				'- files: packages/core/src/lib/contracts/interfaces/project-profile.interface.ts',
				'- files: plugins/proposals/src/lib/swarm/contract-migration-policy.ts',
				'- migration_phase: contract',
				'- gate: type',
				'',
			].join('\n'),
		);
		const out = parse(
			await runContinueProposal(
				{ mode: 'plan', proposalId: 'r00044' },
				options,
			),
		);
		expect(out.kind).toBe('slice-plan');
		expect(out.claimableSliceIds).not.toContain('S5');
		expect(out.claimableSliceIds).not.toContain('S6');
		const verifySlice = out.plan.slices.find(
			(slice: { sliceId: string }) => slice.sliceId === 'S5',
		);
		expect(verifySlice.migrationGuidance.phase).toBe('verify');
		expect(
			verifySlice.migrationGuidance.worktreeImpactPolicy.isolation,
		).toBe('agent-worktree');
		expect(
			verifySlice.migrationGuidance.worktreeImpactPolicy.claimMode,
		).toBe('requires-agent-worktree');
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
		expect(out.nextAction).toContain('proposals_await_lock');
		expect(out.nextAction).toContain('lock-released');
	});

	it('uses a composite task_id per proposal when claiming the same sliceId and release matches that id', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{ id: 'f00091-alpha', file: 'f00091.md', status: 'ready' },
					{ id: 'f00092-beta', file: 'f00092.md', status: 'ready' },
				],
			}),
		);
		writeFileSync(
			join(root, 'f00091.md'),
			[
				'# f00091-alpha',
				'',
				'## Slices',
				'',
				'### S1 — independent',
				'- **Files**: `src/alpha.ts`',
				'- **Gate**: none',
				'- **Status**: pending',
			].join('\n'),
		);
		writeFileSync(
			join(root, 'f00092.md'),
			[
				'# f00092-beta',
				'',
				'## Slices',
				'',
				'### S1 — independent',
				'- **Files**: `src/beta.ts`',
				'- **Gate**: none',
				'- **Status**: pending',
			].join('\n'),
		);

		const firstClaim = parse(
			await runContinueProposal(
				{
					proposalId: 'f00091-alpha',
					mode: 'claim',
					sliceId: 'S1',
					agentName: 'falcon',
				},
				options,
			),
		);
		expect(firstClaim.kind).toBe('slice-claim');

		const secondClaim = parse(
			await runContinueProposal(
				{
					proposalId: 'f00092-beta',
					mode: 'claim',
					sliceId: 'S1',
					agentName: 'owl',
				},
				options,
			),
		);
		expect(secondClaim.kind).toBe('slice-claim');

		const deps = {
			lockPath: options.lockPathAbs,
			toolName: 'proposals_agent_lock',
		};
		const lockStatus = parseTextOnly(
			await runAgentLockEngine({ action: 'status' }, deps),
		);
		expect(lockStatus.in_flight).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					task_id: 'f00091-alpha-S1',
					agent: 'falcon',
				}),
				expect.objectContaining({
					task_id: 'f00092-beta-S1',
					agent: 'owl',
				}),
			]),
		);

		await runAgentLockEngine(
			{ action: 'release', task_id: 'f00091-alpha-S1' },
			deps,
		);
		const afterFirstRelease = parseTextOnly(
			await runAgentLockEngine({ action: 'status' }, deps),
		);
		expect(afterFirstRelease.in_flight).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					task_id: 'f00092-beta-S1',
					agent: 'owl',
				}),
			]),
		);
		expect(afterFirstRelease.in_flight).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ task_id: 'f00091-alpha-S1' }),
			]),
		);

		await runAgentLockEngine(
			{ action: 'release', task_id: 'f00092-beta-S1' },
			deps,
		);
		const afterSecondRelease = parseTextOnly(
			await runAgentLockEngine({ action: 'status' }, deps),
		);
		expect(afterSecondRelease.active_write_lanes).toBe(0);
	});

	it('skips a ready proposal whose slices exist but none are claimable because live ownership already covers them', async () => {
		writeFileSync(
			options.indexPathAbs,
			JSON.stringify({
				proposals: [
					{ id: 'f00020', file: 'f00020.md', status: 'ready' },
					{ id: 'p2-second', file: 'p2.md', status: 'pending' },
				],
			}),
		);
		writeFileSync(
			join(root, 'f00020.md'),
			[
				'---',
				'id: f00020',
				'---',
				'',
				'# f00020',
				'',
				'## Slices',
				'',
				'### S12 — aggregator',
				'',
				'- **Files**: `plugins/quality/src/lib/run-all.ts`',
			].join('\n'),
		);
		writeFileSync(join(root, 'p2.md'), '# free fallback\n');
		writeFileSync(
			options.lockPathAbs,
			JSON.stringify({
				in_flight: [
					{
						task_id: 'f00020-S11-S13',
						agent: 'hydra',
						ownership: ['plugins/quality/src/lib/run-all.ts'],
					},
				],
			}),
		);
		const out = parse(await runContinueProposal({ mode: 'auto' }, options));
		expect(out.kind).toBe('next-proposal');
		expect(out.proposalId).toBe('p2-second');
	});

	// f00016 S4: new-system entries (id prefix is one of the 12 live kinds,
	// status is one of the 7 glossary statuses) are actionable by FOLDER
	// (derived from the index `file` path), not by status string.
	describe('folder-aware cascade for new-system (f00016) entries', async () => {
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

		it.each(['paused', 'blocked', 'done', 'retired'])(
			'skips a new-system entry living in %s/',
			async (folder) => {
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
			},
		);

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
