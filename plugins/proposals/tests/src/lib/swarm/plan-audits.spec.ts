/**
 * plan-audits.spec.ts — a plan that contains audits closes only when its
 * ledger settles every finding and every settling proposal is done.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IProposalFrontmatter } from '@delendai/proposals/lib/proposals/proposal-document';
import { parseAuditLedger } from '@delendai/proposals/lib/proposals/audit-findings';
import { planBlocks } from '@delendai/proposals/lib/proposals/plan-blocks';
import { evaluatePlanClosure } from '@delendai/proposals/lib/swarm/plan-closure.engine';
import { buildInMemoryResolver } from '@delendai/proposals/lib/swarm/plan-closure.resolvers';
import {
	containedAuditIds,
	openPlansContaining,
	readPlanAudits,
} from '@delendai/proposals/lib/swarm/plan-audits.service';

const plan: IProposalFrontmatter = {
	id: 'q00050',
	type: 'plan',
	status: 'in-progress',
	track: 'audits',
	contains: { audits: [{ id: 'a00095' }] },
};

const findings = new Map([
	['a00095', ['G1', 'G2'].map((id) => ({ id, title: id, seenBy: [] }))],
]);

const ledger = (rows: readonly string[]) =>
	parseAuditLedger(
		[
			'## Ledger',
			'',
			'| Finding | Settlement | Agreement |',
			'| --- | --- | --- |',
			...rows,
		].join('\n'),
	);

const close = (rows: readonly string[], x00940: string) =>
	evaluatePlanClosure({
		planId: 'q00050',
		frontmatter: plan,
		resolver: buildInMemoryResolver({
			proposals: new Map([['x00940', { status: x00940 }]]),
		}),
		audits: { findingsByAudit: findings, ledger: ledger(rows) },
	});

describe('a plan that contains audits', () => {
	it('stays open while a finding is unsettled or its proposal is not done', async () => {
		const report = await close(
			['| a00095/G1 | settled-by: x00940 | confirmed: glm |'],
			'review',
		);
		expect(report.closable).toBe(false);
		expect(
			report.reasons.map((reason) => [reason.ref, reason.code]),
		).toEqual([
			['a00095/G1', 'unsettled-finding'],
			['a00095/G2', 'unsettled-finding'],
		]);
		expect(report.reasons[0]?.message).toContain(
			'settled by x00940, not done yet',
		);
	});

	it('closes once every finding is settled and its proposals are done', async () => {
		const report = await close(
			[
				'| a00095/G1 | settled-by: x00940 | confirmed: glm |',
				'| a00095/G2 | rejected: out of scope | |',
			],
			'done',
		);
		expect(report.closable).toBe(true);
	});

	it('names the audits it contains, as entries or bare ids', () => {
		expect(containedAuditIds(plan)).toEqual(['a00095']);
		expect(
			containedAuditIds(
				planBlocks({ contains: { audits: ['a00001', { id: ' ' }] } }),
			),
		).toEqual(['a00001']);
		expect(containedAuditIds({ ...plan, contains: {} })).toEqual([]);
	});
});

describe('the audits on disk', () => {
	const tree = () => {
		const root = mkdtempSync(join(tmpdir(), 'plan-audits-'));
		const docs = join(root, 'docs');
		mkdirSync(join(docs, 'in-progress'), { recursive: true });
		const planText = [
			'---',
			'id: q00050',
			'type: plan',
			'status: in-progress',
			'contains:',
			'  audits:',
			'    - id: a00095',
			'---',
			'## Ledger',
			'| Finding | Settlement | Agreement |',
			'| --- | --- | --- |',
			'| a00095/G1 | rejected: no | |',
		].join('\n');
		writeFileSync(join(docs, 'in-progress', 'q00050-plan.md'), planText);
		writeFileSync(
			join(docs, 'in-progress', 'a00095-audit.md'),
			'---\nid: a00095\n---\n## Findings\n### G1 — One\n- Evidence: `a.ts:1`\n### G2 — Two\n',
		);
		// The index lives in the cache, apart from the documents, as it does in a project.
		mkdirSync(join(root, 'cache'), { recursive: true });
		const index = join(root, 'cache', 'index.json');
		writeFileSync(
			index,
			JSON.stringify({
				proposals: [
					{
						id: 'q00050',
						file: 'in-progress/q00050-plan.md',
						status: 'in-progress',
						type: 'plan',
					},
					{
						id: 'a00095',
						file: 'in-progress/a00095-audit.md',
						status: 'in-progress',
					},
				],
			}),
		);
		return { index, docs, planText };
	};

	it('reads the contained audits and the ledger, and finds the plan an audit is in', async () => {
		const { docs, planText } = tree();
		const audits = await readPlanAudits({
			frontmatter: plan,
			planMarkdown: planText,
			proposalsDirAbs: docs,
		});
		expect(
			audits?.findingsByAudit.get('a00095')?.map((finding) => finding.id),
		).toEqual(['G1', 'G2']);
		expect(audits?.ledger).toHaveLength(1);
		expect(
			await readPlanAudits({
				frontmatter: { ...plan, contains: {} },
				planMarkdown: '',
				proposalsDirAbs: docs,
			}),
		).toBeUndefined();
		expect(
			await openPlansContaining({
				auditId: 'a00095',
				proposalsDirAbs: docs,
			}),
		).toEqual(['q00050']);
		expect(
			await openPlansContaining({
				auditId: 'a00001',
				proposalsDirAbs: docs,
			}),
		).toEqual([]);
	});
});
