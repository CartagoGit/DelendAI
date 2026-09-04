import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@delendai/core/public';
import type { ILogIncident } from '@delendai/logs/public';

import type { IIncidentProposalToolOptions } from '@delendai/proposals/lib/contracts/interfaces/incident-proposal-tool-options.interface';
import { buildAutoFixQueueRegistration } from '@delendai/proposals/lib/tools/auto-fix-queue.tool';

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

const incident = (overrides: Partial<ILogIncident> = {}): ILogIncident => ({
	incidentType: 'tool-failure',
	toolName: 'proposals_auto_fix_queue',
	hasStack: true,
	count: 4,
	distinctAgents: 2,
	firstSeen: '2026-08-24T10:00:00.000Z',
	lastSeen: '2026-08-24T11:00:00.000Z',
	sampleSummary: 'tool-failed: deterministic fixture',
	sampleError: 'process timeout after 45000ms',
	recentEvents: [],
	...overrides,
});

describe('auto_fix_queue tool', () => {
	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'auto-fix-queue-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const buildOptions = (
		incidents: readonly ILogIncident[],
	): IIncidentProposalToolOptions => ({
		namespacePrefix: 'proposals',
		workspaceRoot: root,
		proposalsDirAbs: join(root, 'docs/delendai/proposals'),
		indexPathAbs: join(root, '.cache/delendai/proposals/index.json'),
		counterPathAbs: join(root, '.cache/proposal-id-counters.json'),
		layout: {
			proposalsDir: 'docs/delendai/proposals',
			proposalIndexFile: '.cache/delendai/proposals/index.json',
		},
		readIncidents: async () => ({
			incidents,
			totalIncidents: incidents.length,
		}),
	});

	it('groups and prioritizes auto-fixable vs needs-human without writing', async () => {
		const incidents = [
			incident({
				count: 3,
				sampleSummary: 'performance regression in queue ordering',
				sampleError: 'process timeout after 45000ms',
			}),
			incident({
				count: 8,
				incidentType: 'duplicate-incident',
				sampleSummary: 'duplicate incident already tracked',
				sampleError: 'duplicate issue already tracked',
			}),
			incident({
				incidentType: 'needs-repro',
				sampleSummary: 'needs repro before action',
				sampleError: '',
			}),
		];
		const handler = await capture(
			buildAutoFixQueueRegistration(buildOptions(incidents)),
		);

		const result = parse(await handler({}));

		expect(result.ok).toBe(true);
		expect(result.autoFixable).toHaveLength(2);
		expect(result.needsHuman).toHaveLength(1);
		expect(result.autoFixable[0]?.classification).toBe('PERFORMANCE');
		expect(result.autoFixable[1]?.classification).toBe('DUPLICATE');
		expect(result.needsHuman[0]?.classification).toBe('NEEDS_REPRODUCTION');
		expect(result.written).toBeUndefined();
		expect(existsSync(join(root, 'docs/delendai/proposals'))).toBe(false);
	});

	it('writes only the auto-fixable proposals through create_proposal path', async () => {
		const incidents = [
			incident({
				sampleSummary: 'performance regression in queue ordering',
				sampleError: 'process timeout after 45000ms',
			}),
			incident({
				incidentType: 'duplicate-incident',
				sampleSummary: 'duplicate incident already tracked',
				sampleError: 'duplicate issue already tracked',
			}),
			incident({
				incidentType: 'needs-repro',
				sampleSummary: 'needs repro before action',
				sampleError: '',
			}),
		];
		const handler = await capture(
			buildAutoFixQueueRegistration(buildOptions(incidents)),
		);

		const result = parse(await handler({ write: true }));

		expect(result.ok).toBe(true);
		expect(result.written).toBe(2);
		expect(result.files).toHaveLength(2);
		for (const file of result.files) {
			const path = join(root, 'docs/delendai/proposals', file);
			const body = readFileSync(path, 'utf8');
			expect(body).toContain('auto_fix_candidate: true');
			expect(body).toContain('public_contract_safe: true');
			expect(body).toContain('signature:');
		}
		expect(result.needsHuman).toHaveLength(1);
		expect(result.needsHuman[0]?.decision).toBe('needs-human');
	});
});
