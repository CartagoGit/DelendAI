/**
 * proposal-detail-webview.spec.ts — f00097 S3.
 *
 * Pins the read-only detail webview: four cards, HTML escaping, a strict CSP,
 * and the snapshot layer's per-proposal fetch (diagnose bag + proposal-scoped
 * log filtering).
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import {
	type IProposalDetail,
	ProposalsSnapshotSource,
} from '../lib/proposals-snapshot';
import { renderProposalDetailHtml } from '../views/proposal-detail-webview';

const baseDetail: IProposalDetail = {
	id: 'f00097',
	summary: {
		id: 'f00097',
		status: 'in-progress',
		slices: [{ sliceId: 'S2', status: 'done', owner: 'runner' }],
		claimableSliceIds: ['S3'],
	},
	diagnose: { ok: true, status: 'in_progress', folder: 'ready' },
	logs: [
		{
			ts: '2026-07-03T10:00:00Z',
			kind: 'proposal_transition',
			agent: 'runner',
			taskId: 'f00097',
			summary: 'ready → in_progress',
		},
	],
	agents: [{ name: 'implementation_runner', taskId: 'f00097' }],
	progress: {
		total: 4,
		done: 1,
		inProgress: 1,
		pending: 2,
		percent: 25,
		etaLabel: '≈ 2h 10m',
		eta: '2026-07-03T12:00:00Z',
		avgSliceMs: 12_000,
	},
};

describe('renderProposalDetailHtml', () => {
	it('renders the four cards with a strict CSP', () => {
		const html = renderProposalDetailHtml(baseDetail);
		expect(html).toContain('http-equiv="Content-Security-Policy"');
		expect(html).toContain("script-src 'none'");
		expect(html).toContain('f00097');
		expect(html).toContain('Slices (1)');
		expect(html).toContain('Diagnose');
		expect(html).toContain('ready → in_progress');
		expect(html).toContain('Logs (1)');
	});

	it('escapes HTML in projected values', () => {
		const html = renderProposalDetailHtml({
			...baseDetail,
			logs: [
				{
					ts: 't',
					kind: 'k',
					agent: null,
					taskId: 'f00097',
					summary: '<script>alert(1)</script>',
				},
			],
		});
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('notes proposals absent from the actionable board', () => {
		const html = renderProposalDetailHtml({
			id: 'a00040',
			logs: [],
			agents: [],
			progress: {
				total: 0,
				done: 0,
				inProgress: 0,
				pending: 0,
				percent: 0,
			},
		});
		expect(html).toContain('not on the actionable board');
	});

	it('renders the progress, agents and plan cards when populated', () => {
		const html = renderProposalDetailHtml({
			...baseDetail,
			planMarkdown: '# Plan\n\n- Ship slice S3\n- Update the docs page\n',
		});
		expect(html).toContain('Progress');
		expect(html).toContain('role="progressbar"');
		expect(html).toContain('25%');
		expect(html).toContain('≈ 2h 10m');
		expect(html).toContain('Agents working');
		expect(html).toContain('implementation_runner');
		expect(html).toContain('Plan');
		expect(html).toContain('<h1>Plan</h1>');
		expect(html).toContain('Ship slice S3');
	});
});

describe('ProposalsSnapshotSource.fetchProposalDetail', () => {
	const source = () =>
		new ProposalsSnapshotSource({
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name.endsWith('proposal_board')) {
						return {
							structuredContent: {
								proposals: [
									{
										id: 'f00097',
										status: 'ready',
										slices: [],
									},
								],
							},
						};
					}
					if (input.name.endsWith('proposal_diagnose')) {
						return {
							structuredContent: { ok: true, folder: 'ready' },
						};
					}
					if (input.name.endsWith('logs_tail')) {
						return {
							structuredContent: {
								events: [
									{
										ts: '1',
										kind: 'proposal_transition',
										agent: 'x',
										taskId: 'other',
										summary: 'a',
									},
									{
										ts: '2',
										kind: 'agent-alive',
										agent: 'x',
										taskId: 'f00097',
										summary: 'b',
									},
									{
										ts: '3',
										kind: 'agent-alive',
										agent: 'x',
										taskId: 'unrelated',
										summary: 'c',
									},
								],
							},
						};
					}
					return { structuredContent: {} };
				},
			}),
		});

	it('keeps logs matching taskId or proposal_transition, drops the rest', async () => {
		const detail = await source().fetchProposalDetail('f00097');
		expect(detail.summary?.status).toBe('ready');
		expect(detail.diagnose).toMatchObject({ ok: true, folder: 'ready' });
		expect(detail.logs.map((l) => l.summary)).toEqual(['a', 'b']);
	});

	it('tolerates a failed diagnose and empty logs', async () => {
		const s = new ProposalsSnapshotSource({
			client: McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name.endsWith('proposal_board')) {
						return { structuredContent: { proposals: [] } };
					}
					return { isError: true, content: [{ text: 'boom' }] };
				},
			}),
		});
		const detail = await s.fetchProposalDetail('z99999');
		expect(detail.summary).toBeUndefined();
		expect(detail.diagnose).toBeUndefined();
		expect(detail.logs).toEqual([]);
	});
});
