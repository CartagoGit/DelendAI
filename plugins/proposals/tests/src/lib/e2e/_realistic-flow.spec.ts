// Standalone test to verify the realistic close_plan flow works
import { describe, expect, it } from 'vitest';
import {
	createAssembledProposalsServer,
	type IAssembledProposalsServer,
} from './assembled-proposals-server';
import { afterEach, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { VALIDATE_LOG_RELATIVE_PATH } from '@mcp-vertex/proposals/lib/contracts/constants/proposal-paths.constant';

const PROPOSALS_RELDIR = 'docs/mcp-vertex/proposals';

describe('realistic close_plan flow', async () => {
	let harness: IAssembledProposalsServer;

	beforeEach(async () => {
		harness = await createAssembledProposalsServer({
			requirePeerReview: true,
		});
	});

	afterEach(async () => {
		await harness.close();
	});

	it('seeds and submits', async () => {
		const parentRelName = 'q09994-parent-plan.md';
		const parentActiveDir = join(
			harness.workspace,
			PROPOSALS_RELDIR,
			'in-progress',
		);
		mkdirSync(parentActiveDir, { recursive: true });
		const parentActivePath = join(parentActiveDir, parentRelName);
		writeFileSync(
			parentActivePath,
			[
				'---',
				'id: q09994',
				'status: in-progress',
				'type: plan',
				'kind: plan',
				'title: parent plan',
				'shipped-in: [30551533]',
				'contains:',
				'  proposals:',
				'    - id: f09995',
				'closureGate:',
				'  requireAllChildrenDone: true',
				'---',
				'',
				'# q09994 - parent plan',
				'',
			].join('\n'),
			'utf8',
		);

		const childRelName = 'f09995-child-feat.md';
		const childActivePath = join(parentActiveDir, childRelName);
		writeFileSync(
			childActivePath,
			[
				'---',
				'id: f09995',
				'status: in-progress',
				'type: proposal',
				'kind: feat',
				'title: child feat',
				'shipped-in: [30551533]',
				'---',
				'',
				'# f09995 - child feat',
				'',
				'## Slices',
				'',
				'### S1 — only slice',
				'- **Files**: `src/f09995-slice.ts`',
				'- **Status**: pending',
				'- **Gate**: e2e',
				'',
			].join('\n'),
			'utf8',
		);
		const childDeclaredFile = join(
			harness.workspace,
			'src',
			'f09995-slice.ts',
		);
		mkdirSync(dirname(childDeclaredFile), { recursive: true });
		writeFileSync(
			childDeclaredFile,
			'export const completed = true;\n',
			'utf8',
		);

		const sync = await harness.callTool<{ ok: boolean }>(
			'mcp-vertex_proposals_sync_proposals',
			{},
		);
		expect(sync.ok).toBe(true);

		const validateLogPath = join(
			harness.workspace,
			'.cache',
			'validate.log',
		);
		mkdirSync(dirname(validateLogPath), { recursive: true });
		writeFileSync(validateLogPath, 'ok\n', 'utf8');
		const journalPath = join(harness.workspace, VALIDATE_LOG_RELATIVE_PATH);
		mkdirSync(dirname(journalPath), { recursive: true });
		const validateTimestamp = new Date().toISOString();
		writeFileSync(
			journalPath,
			`${JSON.stringify({
				ts: validateTimestamp,
				result: 'pass',
				exitCode: 0,
				logPath: validateLogPath,
			})}\n`,
			'utf8',
		);
		const validateEvidence = {
			timestamp: validateTimestamp,
			exitCode: 0,
			logPath: validateLogPath,
		};

		const claimed = await harness.callTool<{
			ok?: boolean;
			blocked?: boolean;
		}>('mcp-vertex_proposals_agent_lock', {
			action: 'claim',
			task_id: 'f09995-S1',
			agent: 'implementer-A',
			files: ['src/f09995-slice.ts'],
		});
		writeFileSync(
			'/tmp/claim-result.json',
			JSON.stringify(
				{
					text: claimed.text,
					ok: claimed.ok,
					structured: claimed.structured,
				},
				null,
				2,
			),
		);
		expect(claimed.ok).toBe(true);

		const toReview = await harness.callTool<{
			ok: boolean;
			from?: string;
			to?: string;
			error?: { reason?: string };
		}>('mcp-vertex_proposals_proposal_transition', {
			id: 'f09995',
			to: 'review',
			reason: 'ready for peer review',
			validateEvidence,
		});
		writeFileSync(
			'/tmp/to-review-result.json',
			JSON.stringify(
				{
					text: toReview.text,
					ok: toReview.ok,
					structured: toReview.structured,
				},
				null,
				2,
			),
		);
		expect(toReview.ok).toBe(true);

		const submitted = await harness.callTool<{
			ok: boolean;
			status?: string;
			error?: { reason?: string };
		}>('mcp-vertex_proposals_proposal_review', {
			proposalId: 'f09995',
			sliceId: 'S1',
			action: 'submit',
			agent: 'implementer-A',
		});
		writeFileSync(
			'/tmp/submit-result.json',
			JSON.stringify(
				{
					text: submitted.text,
					ok: submitted.ok,
					structured: submitted.structured,
				},
				null,
				2,
			),
		);
		expect(submitted.ok).toBe(true);

		const approved = await harness.callTool<{
			ok: boolean;
			status?: string;
			error?: { reason?: string };
		}>('mcp-vertex_proposals_proposal_review', {
			proposalId: 'f09995',
			sliceId: 'S1',
			action: 'approve',
			agent: 'reviewer-B',
			evidence: {
				commitHash: 'abc1234',
				validateExitCode: 0,
				testsPassing: 1,
				testsTotal: 1,
			},
		});
		writeFileSync(
			'/tmp/approve-result.json',
			JSON.stringify(
				{
					text: approved.text,
					ok: approved.ok,
					structured: approved.structured,
				},
				null,
				2,
			),
		);
		expect(approved.ok).toBe(true);
		expect(approved.structured.status).toBe('done');

		const closePlan = await harness.callTool<{
			dryRun: boolean;
			ok?: boolean;
			planId?: string;
			closable?: boolean;
			blockers?: ReadonlyArray<unknown>;
			preview?: { from: string; to: string };
			error?: { reason: string };
		}>('mcp-vertex_proposals_proposals_close_plan', {
			planId: 'q09994',
			reason: 'all contained proposals are done',
		});
		writeFileSync(
			'/tmp/close-plan-result.json',
			JSON.stringify(
				{
					text: closePlan.text,
					ok: closePlan.ok,
					structured: closePlan.structured,
				},
				null,
				2,
			),
		);
		expect(closePlan.ok).toBe(true);
		expect(closePlan.structured.closable).toBe(true);
		expect(closePlan.structured.blockers).toEqual([]);
	});
});
