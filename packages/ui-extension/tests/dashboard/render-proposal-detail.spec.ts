import { describe, expect, it } from 'vitest';
import { fakePartial } from '@delendai/test-kit';
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
	diagnose: { folder: 'docs/delendai/proposals', ok: true },
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

describe('the markdown a proposal plan is rendered with', () => {
	const body = (planMarkdown: string): string =>
		renderProposalDetailBody({ ...DETAIL, planMarkdown });

	it('renders every heading level and trims the hashes off', () => {
		// Counted rather than matched now, so every level has to be
		// pinned: `#` through `######`, and a seventh hash is not a
		// heading at all.
		const html = body(
			[
				'# One',
				'## Two',
				'### Three',
				'#### Four',
				'##### Five',
				'###### Six',
				'####### Seven',
			].join('\n'),
		);

		expect(html).toContain('<h1>One</h1>');
		expect(html).toContain('<h6>Six</h6>');
		expect(html).not.toContain('<h7>');
		expect(html).toContain('####### Seven');
	});

	it('does not treat a hash without a space as a heading', () => {
		// The card itself has an `<h1>` with the proposal id, so the
		// assertion is about this text, not about the tag existing.
		const html = body('#nothashtag');

		expect(html).not.toContain('<h1>nothashtag</h1>');
		expect(html).toContain('#nothashtag');
	});

	it('keeps a code fence verbatim and escapes what is inside it', () => {
		const html = body(
			['```', '<script>alert(1)</script>', '```'].join('\n'),
		);

		expect(html).toContain('<pre><code>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>alert(1)</script>');
	});

	it('closes a fence the author left open', () => {
		// An unterminated fence must not leak the rest of the document
		// into raw output.
		const html = body(['```', 'still code'].join('\n'));

		expect(html).toContain('</code></pre>');
	});

	it('renders list items and paragraphs, escaping both', () => {
		const html = body(
			[
				'- first <b>item</b>',
				'* second',
				'',
				'a paragraph <i>too</i>',
			].join('\n'),
		);

		expect(html).toContain('<li>first &lt;b&gt;item&lt;/b&gt;</li>');
		expect(html).toContain('<li>second</li>');
		expect(html).toContain('<p>a paragraph &lt;i&gt;too&lt;/i&gt;</p>');
	});

	it('stays linear on a line of nothing but spaces', () => {
		// The pattern this replaced rescanned such a line once per
		// starting offset, and the plan markdown is a file somebody else
		// wrote.
		const startedAt = performance.now();
		const html = body(`# Goal\n${' '.repeat(40_000)}\ntail`);

		expect(html).toContain('<h1>Goal</h1>');
		expect(performance.now() - startedAt).toBeLessThan(1_000);
	});
});

describe('a detail whose optional parts are missing or odd', () => {
	it('falls back to the diagnose status, then to a dash', () => {
		const { summary: _summary, ...withoutSummary } = DETAIL;
		const noSummary = renderProposalDetailBody(
			fakePartial<IProposalDetail>({
				...withoutSummary,
				diagnose: { folder: 'docs/x', ok: true, status: 'blocked' },
			}),
		);
		expect(noSummary).toContain('blocked');

		const nothing = renderProposalDetailBody(
			fakePartial<IProposalDetail>({
				...withoutSummary,
				diagnose: { ok: true },
			}),
		);
		// Neither source said anything, so the card says so rather than
		// rendering `undefined`.
		expect(nothing).toContain('—');
		expect(nothing).not.toContain('undefined');
	});

	it('omits the folder and the lock owners when there are none', () => {
		const html = renderProposalDetailBody(
			fakePartial<IProposalDetail>({ ...DETAIL, diagnose: { ok: true } }),
		);

		expect(html).not.toContain(DEFAULT_PROPOSAL_DETAIL_COPY.folder);
		expect(html).not.toContain(DEFAULT_PROPOSAL_DETAIL_COPY.lockOwners);
	});

	it('lists the lock owners it can read and ignores what it cannot', () => {
		const html = renderProposalDetailBody(
			fakePartial<IProposalDetail>({
				...DETAIL,
				diagnose: {
					ok: true,
					folder: 'docs/x',
					// Deliberately mixed: the renderer keeps the strings
					// and drops what it cannot read.
					lockOwners: ['agent-A', 42, null, 'agent-B'],
				},
			}),
		);

		// The whole list, exactly: a number or a null between the names
		// would show up inside this `<dd>` and nowhere else.
		expect(html).toContain('<dd>agent-A, agent-B</dd>');
	});
});
