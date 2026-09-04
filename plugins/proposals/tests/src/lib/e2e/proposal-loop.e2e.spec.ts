/**
 * End-to-end: full one-slice proposal loop over the real MCP protocol.
 *
 * Drives an assembled mcp-vertex server (core + proposals) through the
 * exact tool loop an operator expects for a one-slice proposal:
 * sync -> auto_work -> agent_lock claim -> proposal_transition(review)
 * -> proposal_review submit/approve -> final parent closure.
 *
 * Two variants matter here:
 * - feat proposals must leave the non-terminal folders immediately after
 *   the last slice approval.
 * - plan proposals must be closable through proposals_close_plan after
 *   the last slice approval.
 *
 * The assertions intentionally fail if a parent proposal remains stranded
 * in ready/in-progress/review after the final approval step.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VALIDATE_LOG_RELATIVE_PATH } from '@delendai/proposals/lib/contracts/constants/proposal-paths.constant';
import { proposalFolderFor } from '@delendai/proposals/lib/contracts/proposal-folder-policy';
import { AUTO_TRANSITION_REPAIRS_RELATIVE_PATH } from '@delendai/proposals/lib/services/auto-transition';

import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
	type IAssembledToolResult,
} from './assembled-proposals-server';

const PROPOSALS_RELDIR = 'docs/mcp-vertex/proposals';

const MINIMAL_APPROVE_EVIDENCE = {
	commitHash: 'abc1234',
	validateExitCode: 0,
	testsPassing: 1,
	testsTotal: 1,
} as const;

interface AutoWorkOutput {
	readonly state: 'idle' | 'work';
	readonly proposalId?: string;
	readonly file?: string;
	readonly action?: 'close';
	readonly nextAction?: string;
	readonly claimReady?: {
		readonly sliceId: string;
		readonly files: string[];
		readonly gate: 'lint' | 'type' | 'e2e' | 'none';
		readonly agent_lock_args: {
			readonly action: 'claim';
			readonly task_id: string;
			readonly agent: '<host-resolved-agent>';
			readonly files: string[];
		};
	};
}

interface LockOutput {
	readonly ok?: boolean;
	readonly blocked?: boolean;
	readonly conflicting_task?: string;
	readonly overlapping_files?: readonly string[];
	readonly in_flight?: ReadonlyArray<{
		readonly task_id: string;
		readonly agent: string;
		readonly ownership: readonly string[];
	}>;
}

interface TransitionOutput {
	readonly ok: boolean;
	readonly from?: string;
	readonly to?: string;
	readonly error?: {
		readonly reason: string;
		readonly nextAction?: string;
	};
}

interface ReviewOutput {
	readonly ok: boolean;
	readonly action: 'submit' | 'approve' | 'request_changes' | 'status';
	readonly status?: 'in_review' | 'changes_requested' | 'done' | 'none';
	readonly implementer?: string | null;
	readonly reviewer?: string | null;
	readonly lockReleased?: boolean;
	readonly assignmentReleased?: boolean;
	readonly error?: {
		readonly reason: string;
		readonly nextAction?: string;
	};
}

interface ClosePlanOutput {
	readonly dryRun: boolean;
	readonly ok?: boolean;
	readonly planId?: string;
	readonly closable?: boolean;
	readonly blockers?: ReadonlyArray<{
		readonly ref: string;
		readonly kind: 'proposal' | 'plan' | 'slice';
		readonly code: string;
		readonly message: string;
	}>;
	readonly preview?: {
		readonly from: string;
		readonly to: string;
	};
	readonly error?: {
		readonly reason: string;
		readonly nextAction?: string;
	};
}

interface CloseSliceOutput {
	readonly ok: boolean;
	readonly closed?: boolean;
	readonly proposalId?: string;
	readonly sliceId?: string;
}

const slugify = (title: string): string =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

const activeFolderFor = (status: 'ready' | 'in-progress' | 'review'): string =>
	status;

const callAutoWork = async (
	server: IAssembledProposalsServer,
): Promise<IAssembledToolResult<AutoWorkOutput>> =>
	server.callTool<AutoWorkOutput>('mcp-vertex_proposals_auto_work', {});

const callLock = async (
	server: IAssembledProposalsServer,
	args: {
		action: 'claim' | 'status';
		task_id?: string;
		agent?: string;
		files?: string[];
		onContention?: 'fail';
	},
): Promise<IAssembledToolResult<LockOutput>> =>
	server.callTool<LockOutput>('mcp-vertex_proposals_agent_lock', args);

const callTransition = async (
	server: IAssembledProposalsServer,
	args: {
		id: string;
		to: 'review';
		reason: string;
		validateEvidence: {
			timestamp: string;
			exitCode: number;
			logPath: string;
		};
	},
): Promise<IAssembledToolResult<TransitionOutput>> =>
	server.callTool<TransitionOutput>(
		'mcp-vertex_proposals_proposal_transition',
		args,
	);

const callReview = async (
	server: IAssembledProposalsServer,
	args: {
		proposalId: string;
		sliceId: string;
		action: 'submit' | 'approve';
		agent: string;
		evidence?: typeof MINIMAL_APPROVE_EVIDENCE;
	},
): Promise<IAssembledToolResult<ReviewOutput>> =>
	server.callTool<ReviewOutput>('mcp-vertex_proposals_proposal_review', args);

const callClosePlan = async (
	server: IAssembledProposalsServer,
	args: { planId: string; reason: string },
): Promise<IAssembledToolResult<ClosePlanOutput>> =>
	server.callTool<ClosePlanOutput>(
		'mcp-vertex_proposals_proposals_close_plan',
		args,
	);

const callCloseSlice = async (
	server: IAssembledProposalsServer,
	args: {
		proposalId: string;
		sliceId: string;
		validateEvidence: {
			timestamp: string;
			exitCode: number;
			logPath: string;
		};
	},
): Promise<IAssembledToolResult<CloseSliceOutput>> =>
	server.callTool<CloseSliceOutput>('mcp-vertex_proposals_close_slice', args);

const seedValidateArtifacts = (workspace: string) => {
	const validateLogPath = join(workspace, '.cache', 'validate.log');
	mkdirSync(dirname(validateLogPath), { recursive: true });
	writeFileSync(validateLogPath, 'ok\n', 'utf8');

	const journalPath = join(workspace, VALIDATE_LOG_RELATIVE_PATH);
	mkdirSync(dirname(journalPath), { recursive: true });
	const timestamp = new Date().toISOString();
	writeFileSync(
		journalPath,
		`${JSON.stringify({
			ts: timestamp,
			result: 'pass',
			exitCode: 0,
			logPath: validateLogPath,
		})}\n`,
		'utf8',
	);

	return {
		timestamp,
		exitCode: 0,
		logPath: validateLogPath,
	};
};

const seedProposal = async (
	server: IAssembledProposalsServer,
	proposal: {
		id: string;
		title: string;
		kind: 'feat' | 'plan';
		type: 'proposal' | 'plan';
		status: 'in-progress';
	},
): Promise<{
	relName: string;
	activePath: string;
	donePath: string;
}> => {
	const relName = `${proposal.id}-${slugify(proposal.title)}.md`;
	const activeDir = join(
		server.workspace,
		PROPOSALS_RELDIR,
		activeFolderFor(proposal.status),
	);
	mkdirSync(activeDir, { recursive: true });
	const activePath = join(activeDir, relName);
	const donePath = join(
		server.workspace,
		PROPOSALS_RELDIR,
		proposalFolderFor('done', proposal.kind),
		relName,
	);
	writeFileSync(
		activePath,
		`---
id: ${proposal.id}
status: ${proposal.status}
type: ${proposal.type}
track: plugins/proposals+tests
date: 2026-08-31
kind: ${proposal.kind}
title: ${proposal.title}
shipped-in: [30551533]
---

# ${proposal.id} - ${proposal.title}

## goal

Seed for the full proposal loop e2e harness.

## Slices

- global_gate: e2e

### S1 — only slice
- **Files**: \`src/${proposal.id.toLowerCase()}-slice.ts\`
- **Status**: pending
- **Gate**: e2e
`,
		'utf8',
	);
	const declaredFile = join(
		server.workspace,
		'src',
		`${proposal.id.toLowerCase()}-slice.ts`,
	);
	mkdirSync(dirname(declaredFile), { recursive: true });
	writeFileSync(declaredFile, 'export const completed = true;\n', 'utf8');
	const sync = await server.callTool<{ ok: boolean }>(
		'mcp-vertex_proposals_sync_proposals',
		{},
	);
	expect(sync.ok).toBe(true);
	return { relName, activePath, donePath };
};

const expectNotStranded = (
	server: IAssembledProposalsServer,
	relName: string,
) => {
	for (const status of ['ready', 'in-progress', 'review'] as const) {
		expect(
			existsSync(
				join(server.workspace, PROPOSALS_RELDIR, status, relName),
			),
		).toBe(false);
	}
};

describe('e2e: full one-slice proposal loop over the real MCP protocol', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer();
	});

	afterEach(async () => {
		await harness.close();
	});

	it('moves a feat parent to done immediately after approving the last slice', async () => {
		const fixture = await seedProposal(harness, {
			id: 'f09991',
			title: 'full loop feature',
			kind: 'feat',
			type: 'proposal',
			status: 'in-progress',
		});
		const validateEvidence = seedValidateArtifacts(harness.workspace);

		const autoWork = await callAutoWork(harness);
		expect(autoWork.ok).toBe(true);
		expect(autoWork.structured.state).toBe('work');
		expect(autoWork.structured.proposalId).toBe('f09991');
		expect(autoWork.structured.claimReady).toEqual({
			sliceId: 'S1',
			files: ['src/f09991-slice.ts'],
			gate: 'e2e',
			agent_lock_args: {
				action: 'claim',
				task_id: 'f09991-S1',
				agent: '<host-resolved-agent>',
				files: ['src/f09991-slice.ts'],
			},
		});

		const claimed = await callLock(harness, {
			action: 'claim',
			task_id: 'f09991-S1',
			agent: 'implementer-A',
			files: ['src/f09991-slice.ts'],
		});
		expect(claimed.ok).toBe(true);
		expect(claimed.structured.blocked).not.toBe(true);

		const toReview = await callTransition(harness, {
			id: 'f09991',
			to: 'review',
			reason: 'ready for peer review',
			validateEvidence,
		});
		expect(toReview.ok).toBe(true);
		expect(toReview.structured.ok).toBe(true);
		expect(toReview.structured.from).toBe('in-progress');
		expect(toReview.structured.to).toBe('review');

		const submitted = await callReview(harness, {
			proposalId: 'f09991',
			sliceId: 'S1',
			action: 'submit',
			agent: 'implementer-A',
		});
		expect(submitted.ok).toBe(true);
		expect(submitted.structured.status).toBe('in_review');
		expect(submitted.structured.implementer).toBe('implementer-A');

		const approved = await callReview(harness, {
			proposalId: 'f09991',
			sliceId: 'S1',
			action: 'approve',
			agent: 'reviewer-B',
			evidence: MINIMAL_APPROVE_EVIDENCE,
		});
		expect(approved.ok).toBe(true);
		expect(approved.structured.ok).toBe(true);
		expect(approved.structured.status).toBe('done');
		expect(approved.structured.lockReleased).toBe(true);
		expect(approved.structured.assignmentReleased).toBe(false);

		expect(existsSync(fixture.donePath)).toBe(true);
		expectNotStranded(harness, fixture.relName);
		expect(existsSync(fixture.activePath)).toBe(false);
		expect(
			existsSync(
				join(harness.workspace, AUTO_TRANSITION_REPAIRS_RELATIVE_PATH),
			),
		).toBe(false);
	});

	it('keeps a one-slice plan closable and lands it in done/plans after approve plus close_plan', async () => {
		const fixture = await seedProposal(harness, {
			id: 'q09992',
			title: 'full loop plan',
			kind: 'plan',
			type: 'plan',
			status: 'in-progress',
		});
		const validateEvidence = seedValidateArtifacts(harness.workspace);

		const autoWork = await callAutoWork(harness);
		expect(autoWork.ok).toBe(true);
		expect(autoWork.structured.state).toBe('work');
		expect(autoWork.structured.proposalId).toBe('q09992');
		expect(autoWork.structured.claimReady?.sliceId).toBe('S1');

		const claimed = await callLock(harness, {
			action: 'claim',
			task_id: 'q09992-S1',
			agent: 'implementer-A',
			files: ['src/q09992-slice.ts'],
		});
		expect(claimed.ok).toBe(true);
		expect(claimed.structured.blocked).not.toBe(true);
		mkdirSync(join(harness.workspace, 'src'), { recursive: true });
		writeFileSync(
			join(harness.workspace, 'src/q09992-slice.ts'),
			'export const q09992Slice = true;\n',
			'utf8',
		);

		const toReview = await callTransition(harness, {
			id: 'q09992',
			to: 'review',
			reason: 'ready for peer review',
			validateEvidence,
		});
		expect(toReview.ok).toBe(true);
		expect(toReview.structured.ok).toBe(true);
		expect(toReview.structured.to).toBe('review');

		const submitted = await callReview(harness, {
			proposalId: 'q09992',
			sliceId: 'S1',
			action: 'submit',
			agent: 'implementer-A',
		});
		expect(submitted.ok).toBe(true);
		expect(submitted.structured.status).toBe('in_review');

		const approved = await callReview(harness, {
			proposalId: 'q09992',
			sliceId: 'S1',
			action: 'approve',
			agent: 'reviewer-B',
			evidence: MINIMAL_APPROVE_EVIDENCE,
		});
		expect(approved.ok).toBe(true);
		expect(approved.structured.ok).toBe(true);
		expect(approved.structured.status).toBe('done');

		const closePlan = await callClosePlan(harness, {
			planId: 'q09992',
			reason: 'all children and slices are done',
		});
		if (closePlan.ok !== true) {
			expect.fail(JSON.stringify(closePlan));
		}
		expect(closePlan.ok).toBe(true);
		expect(closePlan.structured.dryRun).toBe(false);
		expect(closePlan.structured.closable).toBe(true);
		expect(closePlan.structured.blockers).toEqual([]);
		expect(closePlan.structured.preview).toMatchObject({
			to: 'done',
		});

		expect(existsSync(fixture.donePath)).toBe(true);
		expectNotStranded(harness, fixture.relName);
		expect(existsSync(fixture.activePath)).toBe(false);

		const doneMarkdown = readFileSync(fixture.donePath, 'utf8');
		expect(doneMarkdown).toContain('status: done');
	});

	it('returns an explicit closure action when all active slices are already done', async () => {
		await seedProposal(harness, {
			id: 'f09993',
			title: 'closure handoff feature',
			kind: 'feat',
			type: 'proposal',
			status: 'in-progress',
		});
		const proposalPath = join(
			harness.workspace,
			PROPOSALS_RELDIR,
			'in-progress',
			'f09993-closure-handoff-feature.md',
		);
		writeFileSync(
			proposalPath,
			readFileSync(proposalPath, 'utf8').replace(
				'- **Status**: pending',
				'- **Status**: done',
			),
			'utf8',
		);
		const sync = await harness.callTool<{ ok: boolean }>(
			'mcp-vertex_proposals_sync_proposals',
			{},
		);
		expect(sync.ok).toBe(true);

		const autoWork = await callAutoWork(harness);
		expect(autoWork.ok).toBe(true);
		expect(autoWork.structured).toMatchObject({
			state: 'work',
			proposalId: 'f09993',
			action: 'close',
		});
		expect(autoWork.structured.nextAction).toContain(
			'mcp-vertex_proposals_proposal_transition',
		);
	});

	it('moves a proposal to done when close_slice finishes the last slice and review is disabled', async () => {
		await harness.close();
		harness = await createAssembledProposalsServer({
			requirePeerReview: false,
		});
		const fixture = await seedProposal(harness, {
			id: 'f09994',
			title: 'direct close feature',
			kind: 'feat',
			type: 'proposal',
			status: 'in-progress',
		});
		const validateEvidence = seedValidateArtifacts(harness.workspace);

		const closed = await callCloseSlice(harness, {
			proposalId: 'f09994',
			sliceId: 'S1',
			validateEvidence,
		});
		expect(closed.ok).toBe(true);
		expect(closed.structured.closed).toBe(true);
		expect(existsSync(fixture.donePath)).toBe(true);
		expectNotStranded(harness, fixture.relName);
	});

	it('offers and applies close_plan after the last contained proposal reaches done', async () => {
		// a00072 S4 — realistic flow: the parent plan q09994 holds a
		// `contains.proposals` reference to f09995; f09995 is a feat
		// that goes through the full claim → review → submit → approve
		// cycle and only THEN does `proposals_close_plan` apply the
		// q00001 wrapper. No frontmatter surgery here — every status
		// mutation goes through a real tool call.
		await seedProposal(harness, {
			id: 'f09995',
			title: 'last child',
			kind: 'feat',
			type: 'proposal',
			status: 'in-progress',
		});
		const parent = await seedProposal(harness, {
			id: 'q09994',
			title: 'parent plan',
			kind: 'plan',
			type: 'plan',
			status: 'in-progress',
		});
		// Wire the contains.proposals binding + a closureGate that
		// matches the q00001 default (peer review + done children).
		writeFileSync(
			parent.activePath,
			readFileSync(parent.activePath, 'utf8')
				.replace(
					'title: parent plan',
					`title: parent plan
contains:
  proposals:
    - id: f09995
      kind: feat
      required: true
closureGate:
  requirePeerReview: true
  requireAllSlicesDone: true
  requireAllChildrenDone: true`,
				)
				.replace('- **Status**: pending', '- **Status**: done'),
			'utf8',
		);
		const validateEvidence = seedValidateArtifacts(harness.workspace);

		// Claim + write f09995's declared slice file.
		const claimed = await callLock(harness, {
			action: 'claim',
			task_id: 'f09995-S1',
			agent: 'implementer-A',
			files: [`src/${'f09995'}-slice.ts`],
		});
		expect(claimed.ok).toBe(true);
		expect(claimed.structured.blocked).not.toBe(true);
		mkdirSync(join(harness.workspace, 'src'), { recursive: true });
		writeFileSync(
			join(harness.workspace, 'src/f09995-slice.ts'),
			'export const f09995Slice = true;\n',
			'utf8',
		);

		// Move f09995 through review → submit → approve.
		const toReview = await callTransition(harness, {
			id: 'f09995',
			to: 'review',
			reason: 'ready for peer review',
			validateEvidence,
		});
		expect(toReview.ok).toBe(true);
		expect(toReview.structured.ok).toBe(true);
		expect(toReview.structured.to).toBe('review');

		const submitted = await callReview(harness, {
			proposalId: 'f09995',
			sliceId: 'S1',
			action: 'submit',
			agent: 'implementer-A',
		});
		expect(submitted.ok).toBe(true);
		expect(submitted.structured.status).toBe('in_review');

		const approved = await callReview(harness, {
			proposalId: 'f09995',
			sliceId: 'S1',
			action: 'approve',
			agent: 'reviewer-B',
			evidence: MINIMAL_APPROVE_EVIDENCE,
		});
		expect(approved.ok).toBe(true);
		expect(approved.structured.ok).toBe(true);
		expect(approved.structured.status).toBe('done');

		// Now the wrapper: close_plan for q09994 should succeed via
		// the `skipDfaForPlanClosure: true` shortcut after a clear
		// preflight (the only contained proposal, f09995, is now done).
		const closePlan = await callClosePlan(harness, {
			planId: 'q09994',
			reason: 'last contained proposal is done',
		});
		if (closePlan.ok !== true) {
			expect.fail(JSON.stringify(closePlan));
		}
		expect(closePlan.ok).toBe(true);
		expect(closePlan.structured.dryRun).toBe(false);
		expect(closePlan.structured.closable).toBe(true);
		expect(closePlan.structured.blockers).toEqual([]);
		expect(closePlan.structured.preview).toMatchObject({
			from: 'in-progress',
			to: 'done',
		});

		// The plan file MUST land under done/plans/, and the
		// contained proposal MUST no longer be stranded in
		// ready/in-progress/review.
		expect(existsSync(parent.donePath)).toBe(true);
		expectNotStranded(harness, parent.relName);
		const doneMarkdown = readFileSync(parent.donePath, 'utf8');
		expect(doneMarkdown).toContain('status: done');
	});
});
