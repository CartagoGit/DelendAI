#!/usr/bin/env bun
import { describe, expect, it } from 'vitest';

import {
	PROPOSAL_DETAIL_PROJECTIONS,
	projectProposalCompact,
	projectProposalFull,
	projectProposalNormal,
} from '@delendai/proposals/lib/contracts/proposal-view.contract';
import { projectDetail } from '@delendai/core/public';

import type { IProposalDocument } from '@delendai/proposals/lib/proposals/proposal-document';

const buildDoc = (
	overrides: Partial<IProposalDocument> = {},
): IProposalDocument => ({
	path: '/tmp/q00006-plan.md',
	frontmatter: {
		id: 'q00006',
		type: 'plan',
		status: 'in-progress',
		track: 'tokens',
		kind: 'plan',
		acceptanceCriteria: [
			{ command: 'bun run typecheck', expect: 'exit0' },
			{ command: 'bun run lint', expect: 'pass' },
		],
	},
	body: {
		goal: 'Compactar output schemas en hotspots.',
		motivation: '',
		goals: [],
		nonGoals: [],
		closureCriteria: ['- [x] S1', '- [ ] S2', '- [ ] S3'],
	},
	...overrides,
});

describe('proposal_view projections (r00031)', () => {
	it('compact returns the minimal shape', () => {
		const v = projectProposalCompact(buildDoc());
		expect(v.id).toBe('q00006');
		expect(v.status).toBe('in-progress');
		expect(v.kind).toBe('plan');
		expect(v.track).toBe('tokens');
		expect(v.summary).toContain('Compactar');
		expect(v.progress).toContain('S1');
		expect(v.next).toContain('S2');
	});

	it('compact serialises under 2 KB', () => {
		const v = projectProposalCompact(buildDoc());
		expect(JSON.stringify(v).length).toBeLessThan(2_000);
	});

	it('normal extends compact with slices and acceptance', () => {
		const v = projectProposalNormal(buildDoc());
		expect(v.id).toBe('q00006');
		expect(v.slices.length).toBe(3);
		expect(v.acceptance.length).toBe(2);
		expect(v.acceptance[0]?.command).toBe('bun run typecheck');
	});

	it('normal serialises under 12 KB', () => {
		const v = projectProposalNormal(buildDoc());
		expect(JSON.stringify(v).length).toBeLessThan(12_000);
	});

	it('full returns the document unchanged', () => {
		const doc = buildDoc();
		const v = projectProposalFull(doc);
		expect(v).toBe(doc);
	});

	it('projectDetail picks the right level through the shared dispatcher', () => {
		const doc = buildDoc();
		expect(
			projectDetail(doc, PROPOSAL_DETAIL_PROJECTIONS, 'compact'),
		).toMatchObject({
			id: 'q00006',
		});
		expect(
			projectDetail(doc, PROPOSAL_DETAIL_PROJECTIONS, 'normal'),
		).toMatchObject({
			id: 'q00006',
			slices: expect.any(Array),
		});
		expect(projectDetail(doc, PROPOSAL_DETAIL_PROJECTIONS, 'full')).toBe(
			doc,
		);
	});

	it('projectDetail defaults to normal when no level is requested', () => {
		const doc = buildDoc();
		const out = projectDetail(
			doc,
			PROPOSAL_DETAIL_PROJECTIONS,
		) as ReturnType<typeof projectProposalNormal>;
		expect(out.slices.length).toBe(3);
	});

	it('progress is null when closureCriteria is empty', () => {
		const doc = buildDoc({
			body: {
				...buildDoc().body,
				closureCriteria: [],
			},
		});
		const v = projectProposalCompact(doc);
		expect(v.progress).toBeNull();
		expect(v.next).toBeNull();
	});
});
