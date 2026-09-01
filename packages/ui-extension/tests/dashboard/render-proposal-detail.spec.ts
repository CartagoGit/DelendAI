import { describe, expect, it } from 'vitest';
import type { IProposalDetail } from '../../src/contracts/interfaces/proposal-detail.interface';
import {
	DEFAULT_PROPOSAL_DETAIL_COPY,
	renderProposalDetailBody,
	renderProposalDetailHtml,
} from '../../src/dashboard/render-proposal-detail';

const DETAIL: IProposalDetail = {
	id: 'f00065',
	summary: {
		id: 'f00065',
		status: 'in-progress',
		slices: [
			{ sliceId: 'f00065-S1', status: 'done', owner: 'agent-A' },
			{ sliceId: 'f00065-S2', status: 'in-progress', owner: 'agent-B' },
		],
		claimableSliceIds: ['f00065-S3'],
	},
	diagnose: { folder: 'docs/mcp-vertex/proposals', ok: true },
	logs: [
		{
			ts: '2026-08-31T10:00:00Z',
			kind: 'slice-start',
			agent: 'agent-B',
			taskId: 'f00065-S2',
			summary: 'Started slice S2',
		},
	],
	planMarkdown: '# Goal\n\nDrive S4 forward.',
	agents: [{ name: 'agent-B', taskId: 'f00065-S2' }],
	progress: {
		total: 4,
		done: 1,
		inProgress: 1,
		pending: 2,
		percent: 25,
		eta: '2026-08-31T18:00:00Z',
		etaLabel: '≈ 8h',
		avgSliceMs: 60_000,
	},
};

describe('renderProposalDetail (shared)', () => {
	it('falls back to English copy when no copy is supplied', () => {
		const html = renderProposalDetailHtml(DETAIL);
		expect(html).toContain(DEFAULT_PROPOSAL_DETAIL_COPY.progress);
		expect(html).toContain('Goal');
		expect(html).toContain('Started slice S2');
		expect(html).toContain('agent-B');
		expect(html).toContain('25%');
		expect(html).toContain('≈ 8h');
	});

	it('emits body fragment for shell mounting', () => {
		const html = renderProposalDetailBody(DETAIL);
		expect(html).toContain('card');
		expect(html).toContain('progress__bar');
		expect(html).toContain('agents');
		expect(html).not.toContain('<!DOCTYPE');
	});

	it('honours the supplied copy', () => {
		const html = renderProposalDetailBody(DETAIL, {
			...DEFAULT_PROPOSAL_DETAIL_COPY,
			lang: 'es',
			progress: 'Progreso',
			agents: 'Agentes activos',
			done: 'hecho',
		});
		expect(html).toContain('Progreso');
		expect(html).toContain('Agentes activos');
		expect(html).toContain('1 / 4');
		expect(html).toContain('hecho');
	});

	it('escapes unsafe IDs and plan content', () => {
		const html = renderProposalDetailHtml({
			...DETAIL,
			id: '<script>',
			planMarkdown: '# <img onerror=alert(1)>',
		});
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&lt;img');
	});

	it('renders a diagnose card with kv rows', () => {
		const html = renderProposalDetailBody(DETAIL);
		expect(html).toContain('Diagnose');
		expect(html).toContain('table class="kv"');
		expect(html).toContain('folder');
	});
});
