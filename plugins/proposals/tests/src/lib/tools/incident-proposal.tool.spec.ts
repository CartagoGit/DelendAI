import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import type { ILogIncident } from '@mcp-vertex/logs/public';

import type { IIncidentProposalToolOptions } from '@mcp-vertex/proposals/lib/contracts/interfaces/incident-proposal-tool-options.interface';
import { buildIncidentProposalRegistration } from '@mcp-vertex/proposals/lib/tools/incident-proposal.tool';

const capture = async (
	registration: IToolRegistration,
): Promise<
	(args: unknown) => Promise<{ content: Array<{ text: string }> }>
> => {
	let handler: (
		args: unknown,
	) => Promise<{ content: Array<{ text: string }> }>;
	await registration.register({
		registerTool: (_name: string, _def: unknown, fn: typeof handler) => {
			handler = fn;
		},
	} as never);
	return handler!;
};

const parse = (response: { content: Array<{ text: string }> }): any =>
	JSON.parse(response.content[0]?.text ?? '{}');

const incident = (): ILogIncident => ({
	incidentType: 'tool-failure',
	toolName: 'proposals_incident_proposals',
	hasStack: true,
	count: 4,
	distinctAgents: 2,
	firstSeen: '2026-08-24T10:00:00.000Z',
	lastSeen: '2026-08-24T11:00:00.000Z',
	sampleSummary: 'tool-failed: invalid regex in cluster classifier',
	sampleError: 'invalid regex: [unterminated character class',
	recentEvents: [],
});

describe('incident_proposals tool', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'incident-proposals-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const buildOptions = (): IIncidentProposalToolOptions => ({
		namespacePrefix: 'proposals',
		workspaceRoot: root,
		proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
		indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
		counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		layout: {
			proposalsDir: 'docs/mcp-vertex/proposals',
			proposalIndexFile: '.cache/mcp-vertex/proposals/index.json',
		},
		readIncidents: async () => ({
			incidents: [incident()],
			totalIncidents: 1,
		}),
	});

	it('returns drafts without writing by default', async () => {
		const handler = await capture(
			buildIncidentProposalRegistration(buildOptions()),
		);
		const result = parse(await handler({}));

		expect(result.ok).toBe(true);
		expect(result.drafts).toHaveLength(1);
		expect(result.written).toBeUndefined();
		expect(existsSync(join(root, 'docs/mcp-vertex/proposals'))).toBe(false);
	});

	it('writes ready proposals once and dedupes them on later runs', async () => {
		const handler = await capture(
			buildIncidentProposalRegistration(buildOptions()),
		);

		const first = parse(await handler({ write: true }));
		expect(first.ok).toBe(true);
		expect(first.written).toBe(1);
		expect(first.files).toHaveLength(1);

		const docPath = join(root, 'docs/mcp-vertex/proposals', first.files[0]);
		const body = readFileSync(docPath, 'utf8');
		expect(body).toContain('signature:');
		expect(body).toContain(
			'sampleError: invalid regex: [unterminated character class',
		);

		const second = parse(await handler({ write: true }));
		expect(second.drafts).toEqual([]);
		expect(second.deduped).toBe(1);
		expect(second.written).toBe(0);
	});
});
