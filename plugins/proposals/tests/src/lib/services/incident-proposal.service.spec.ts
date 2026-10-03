import { describe, expect, it } from 'vitest';

import type { ILogIncident } from '@delendai/logs/public';

import {
	buildIncidentProposalDrafts,
	classifyIncidentProposal,
	draftTitleDedupKeyOf,
	incidentSignatureOf,
} from '@delendai/proposals/lib/services/incident-proposal.service';

const incident = (overrides: Partial<ILogIncident> = {}): ILogIncident => ({
	incidentType: 'tool-failure',
	toolName: 'proposals_incident_proposals',
	hasStack: true,
	count: 3,
	distinctAgents: 2,
	firstSeen: '2026-08-24T10:00:00.000Z',
	lastSeen: '2026-08-24T11:00:00.000Z',
	sampleSummary: 'tool-failed: invalid regex in cluster classifier',
	sampleError: 'invalid regex: [unterminated character class',
	recentEvents: [],
	...overrides,
});

describe('incident-proposal.service', () => {
	it('builds one deterministic draft from a redacted cluster', () => {
		const source = incident();
		const result = buildIncidentProposalDrafts([source], new Set());

		expect(result.totalClusters).toBe(1);
		expect(result.deduped).toBe(0);
		expect(result.drafts).toHaveLength(1);
		expect(result.drafts[0]?.signature).toBe(incidentSignatureOf(source));
		expect(result.drafts[0]?.title).toContain(source.toolName);
		expect(result.drafts[0]?.summary).toContain('sample error');
	});

	it('dedupes against explicit signatures and deterministic titles', () => {
		const source = incident();
		const first = buildIncidentProposalDrafts([source], new Set());
		const titleKey = draftTitleDedupKeyOf(first.drafts[0]!.title);

		expect(
			buildIncidentProposalDrafts(
				[source],
				new Set([first.drafts[0]!.signature]),
			).drafts,
		).toEqual([]);
		expect(
			buildIncidentProposalDrafts([source], new Set([titleKey])).deduped,
		).toBe(1);
	});

	it('dedupes repeated clusters inside the same batch', () => {
		const repeated = incident({
			sampleSummary: 'same cluster, different summary',
		});
		const result = buildIncidentProposalDrafts(
			[incident(), repeated],
			new Set(),
		);

		expect(result.totalClusters).toBe(2);
		expect(result.drafts).toHaveLength(1);
		expect(result.deduped).toBe(1);
	});

	it('classifies duplicate and timeout evidence through the shared taxonomy', () => {
		expect(
			classifyIncidentProposal(
				incident({
					incidentType: 'duplicate-incident',
					sampleError: 'duplicate issue already tracked',
				}),
			),
		).toBe('DUPLICATE');
		expect(
			classifyIncidentProposal(
				incident({
					incidentType: 'performance-regression',
					sampleError: 'process timeout after 45000ms',
				}),
			),
		).toBe('PERFORMANCE');
	});
});
