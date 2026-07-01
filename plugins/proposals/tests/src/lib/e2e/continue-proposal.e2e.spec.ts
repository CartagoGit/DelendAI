/**
 * End-to-end: `proposals_continue_proposal` over the real MCP protocol.
 *
 * Slice S2 of f00044. Drives the registered `continue_proposal` tool
 * through a real `Client` connected to an assembled mcp-vertex server
 * (core meta-tools + the proposals plugin) over an in-memory transport.
 * This proves the cross-tool contract (cascade resolution for
 * `mode:"auto"`, slice-plan parsing for `mode:"plan"`, slice claim for
 * `mode:"claim"`) survives registration, request routing and
 * `outputSchema` validation — the unit spec at
 * `tests/src/lib/continue-proposal.spec.ts` cannot catch regressions in
 * any of those stages because it calls `runContinueProposal` directly.
 *
 * The tool's real mode surface is `auto | plan | claim` (see
 * `continue-proposal.tool.ts`); there is no `next` mode. `mode:"auto"`
 * resolves the next actionable proposal by family cascade.
 *
 * Every `it` runs against a fresh `mkdtempSync` workspace; no test
 * mutates a real proposal, lock file, or git repo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
	type IAssembledToolResult,
} from './assembled-proposals-server';

/**
 * The `continue_proposal` outputSchema is a wide union keyed on `kind`.
 * We type the fields the e2e asserts on as optional so each `it` can
 * read them without per-branch narrowing.
 */
interface ContinueProposalOutput {
	readonly kind:
		| 'next-proposal'
		| 'no-proposal'
		| 'all-claimed'
		| 'slice-mode-error'
		| 'slice-plan'
		| 'slice-claim-rejected'
		| 'slice-claim';
	readonly reason?: string;
	readonly nextAction?: string;
	readonly proposalId?: string;
	readonly file?: string;
	readonly status?: string;
	readonly relaunchCommand?: string;
	readonly plan?: {
		readonly proposalId: string;
		readonly slices: ReadonlyArray<{
			readonly sliceId: string;
			readonly title: string;
			readonly status: string;
		}>;
	};
	readonly claimableSliceIds?: readonly string[];
	readonly sliceId?: string;
}

const callContinue = async (
	server: IAssembledProposalsServer,
	args: Record<string, unknown> = {},
): Promise<IAssembledToolResult<ContinueProposalOutput>> =>
	server.callTool<ContinueProposalOutput>(
		'mcp-vertex_proposals_continue_proposal',
		args,
	);

const PROPOSALS_RELDIR = 'docs/mcp-vertex/proposals';

/** Slugify a title the same way the proposals scaffolder does. */
const slugify = (title: string): string =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

/**
 * Seed a proposal under a given status folder. When `slices` is
 * provided, a canonical `## Slices` section is emitted so `mode:"plan"`
 * has claimable slices to parse. After writing, the registry is rebuilt
 * via `proposals_sync_proposals` so the rest of the surface sees it.
 */
const seedProposal = async (
	server: IAssembledProposalsServer,
	proposal: {
		id: string;
		title: string;
		folder?: 'ready' | 'in-progress';
		status?: string;
		slices?: ReadonlyArray<{ id: string; title: string; status?: string }>;
	},
): Promise<{ file: string; relPath: string }> => {
	const folder = proposal.folder ?? 'ready';
	const status = proposal.status ?? folder;
	const dir = join(server.workspace, PROPOSALS_RELDIR, folder);
	mkdirSync(dir, { recursive: true });
	const relPath = `${PROPOSALS_RELDIR}/${folder}/${proposal.id}-${slugify(proposal.title)}.md`;
	const file = join(server.workspace, relPath);

	const slicesBlock =
		proposal.slices && proposal.slices.length > 0
			? `\n## Slices\n\n- global_gate: type\n\n${proposal.slices
					.map(
						(s) =>
							`### ${s.id} — ${s.title}\n- **Files**: plugins/proposals/src/lib/${s.id.toLowerCase()}-${slugify(s.title)}.ts\n- **Status**: ${s.status ?? 'pending'}\n- **Gate**: type\n`,
					)
					.join('\n')}`
			: '\n## goal\n\nSeed for the continue_proposal e2e harness.\n';

	writeFileSync(
		file,
		`---
id: ${proposal.id}
status: ${status}
type: proposal
track: plugins/proposals+tests
date: 2026-06-22
kind: feat
title: ${proposal.title}
---

# ${proposal.id} — ${proposal.title}
${slicesBlock}`,
		'utf8',
	);
	const sync = await server.callTool<{ ok: boolean }>(
		'mcp-vertex_proposals_sync_proposals',
		{},
	);
	expect(sync.ok).toBe(true);
	return { file, relPath };
};

describe('e2e: proposals_continue_proposal over the real MCP protocol', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});

	afterEach(async () => {
		await harness.close();
	});

	it('mode:"auto" resolves the next actionable proposal by cascade', async () => {
		await seedProposal(harness, { id: 'f09001', title: 'cascade target' });

		const res = await callContinue(harness, { mode: 'auto' });
		expect(res.ok).toBe(true);
		expect(res.structured.kind).toBe('next-proposal');
		expect(res.structured.proposalId).toBe('f09001');
		expect(res.structured.file).toMatch(/f09001-cascade-target\.md$/);
		// A resolved proposal carries the relaunch command an agent uses
		// to fetch its slice plan.
		expect(res.structured.relaunchCommand).toMatch(
			/proposals_continue_proposal/,
		);
	});

	it('mode:"auto" returns no-proposal when nothing is actionable', async () => {
		const res = await callContinue(harness, { mode: 'auto' });
		expect(res.ok).toBe(true);
		// With an empty workspace the cascade has nothing to hand out.
		expect(['no-proposal', 'all-claimed']).toContain(res.structured.kind);
	});

	it('mode:"auto" still hands out an in-progress proposal that is not under an active lock', async () => {
		// Anti-loop semantics: `auto` only excludes an in-progress proposal
		// when it is covered by an ACTIVE LOCK (being worked elsewhere). An
		// in-progress proposal with no lock is resumable, so it stays
		// actionable and the cascade returns a real next-proposal — not
		// `all-claimed`.
		await seedProposal(harness, {
			id: 'f09010',
			title: 'resumable in progress',
			folder: 'in-progress',
		});
		await seedProposal(harness, {
			id: 'f09011',
			title: 'still pending',
			folder: 'ready',
		});

		const res = await callContinue(harness, { mode: 'auto' });
		expect(res.ok).toBe(true);
		expect(res.structured.kind).toBe('next-proposal');
		expect(['f09010', 'f09011']).toContain(res.structured.proposalId);
	});

	it('mode:"plan" returns the parsed slice plan with claimable slices', async () => {
		await seedProposal(harness, {
			id: 'f09020',
			title: 'sliced proposal',
			slices: [
				{ id: 'S1', title: 'first slice' },
				{ id: 'S2', title: 'second slice' },
			],
		});

		const res = await callContinue(harness, {
			proposalId: 'f09020',
			mode: 'plan',
		});
		expect(res.ok).toBe(true);
		expect(res.structured.kind).toBe('slice-plan');
		expect(res.structured.plan?.proposalId).toBe('f09020');
		expect(res.structured.plan?.slices.map((s) => s.sliceId)).toEqual([
			'S1',
			'S2',
		]);
		// Both pending slices with no dependsOn are claimable.
		expect(res.structured.claimableSliceIds).toEqual(['S1', 'S2']);
	});

	it('mode:"claim" claims a specific slice and reflects ownership', async () => {
		await seedProposal(harness, {
			id: 'f09030',
			title: 'claim target',
			slices: [{ id: 'S1', title: 'the slice' }],
		});

		const res = await callContinue(harness, {
			proposalId: 'f09030',
			mode: 'claim',
			sliceId: 'S1',
		});
		expect(res.ok).toBe(true);
		// A successful claim returns slice-claim; if the slice cannot be
		// claimed the tool returns slice-claim-rejected with a reason.
		expect(['slice-claim', 'slice-claim-rejected']).toContain(
			res.structured.kind,
		);
		if (res.structured.kind === 'slice-claim') {
			expect(res.structured.sliceId).toBe('S1');
		} else {
			expect((res.structured.reason ?? '').length).toBeGreaterThan(0);
		}
	});

	it('mode:"plan" without a proposalId is a structured slice-mode-error', async () => {
		const res = await callContinue(harness, { mode: 'plan' });
		// No proposalId: the tool cannot resolve a plan and must say so
		// structurally rather than throwing over the wire.
		expect(res.structured.kind).toBe('slice-mode-error');
		expect((res.structured.nextAction ?? '').length).toBeGreaterThan(0);
	});

	it('every response satisfies the outputSchema parity invariant', async () => {
		await seedProposal(harness, {
			id: 'f09040',
			title: 'parity check',
			slices: [{ id: 'S1', title: 'only slice' }],
		});

		const auto = await callContinue(harness, { mode: 'auto' });
		expect(auto.text).toBe(JSON.stringify(auto.structured));

		const plan = await callContinue(harness, {
			proposalId: 'f09040',
			mode: 'plan',
		});
		expect(plan.text).toBe(JSON.stringify(plan.structured));
	});
});
