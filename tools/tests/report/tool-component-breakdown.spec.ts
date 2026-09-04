import { describe, expect, it } from 'vitest';

import {
	jsonBytes,
	measureToolComponentBytes,
} from '../../scripts/report/tool-component-breakdown.helper';
import {
	asPresetId,
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
	listToolsMetrics,
} from '../../scripts/report/token-budget-report-lib';

const sumComponents = (breakdown: {
	readonly nameBytes: number;
	readonly descriptionBytes: number;
	readonly inputSchemaBytes: number;
	readonly outputSchemaBytes: number;
	readonly annotationsBytes: number;
	readonly otherFieldBytes: number;
	readonly envelopeBytes: number;
}): number =>
	breakdown.nameBytes +
	breakdown.descriptionBytes +
	breakdown.inputSchemaBytes +
	breakdown.outputSchemaBytes +
	breakdown.annotationsBytes +
	breakdown.otherFieldBytes +
	breakdown.envelopeBytes;

describe('measureToolComponentBytes', () => {
	it('decomposes a synthetic tool entry into parts that sum to the whole', () => {
		const tool = {
			name: 'delendai_proposals_round_context',
			description: 'Return the current proposal round context.',
			inputSchema: { type: 'object', properties: {} },
			outputSchema: {
				type: 'object',
				properties: { summary: { type: 'string' } },
			},
		};
		const breakdown = measureToolComponentBytes(tool);
		expect(breakdown.totalBytes).toBe(jsonBytes(tool));
		expect(sumComponents(breakdown)).toBe(breakdown.totalBytes);
		expect(breakdown.annotationsBytes).toBe(0);
		expect(breakdown.otherFieldBytes).toBe(0);
	});

	it('accounts for annotations and unknown wire fields without dropping them', () => {
		const tool = {
			name: 'x',
			description: 'y',
			inputSchema: { type: 'object' },
			annotations: { readOnlyHint: true },
			futureField: { nested: [1, 2, 3] },
		};
		const breakdown = measureToolComponentBytes(tool);
		expect(breakdown.annotationsBytes).toBeGreaterThan(0);
		expect(breakdown.otherFieldBytes).toBeGreaterThan(0);
		expect(sumComponents(breakdown)).toBe(breakdown.totalBytes);
	});

	it('handles a tool with no optional fields at all', () => {
		const tool = { name: 'bare' };
		const breakdown = measureToolComponentBytes(tool);
		expect(breakdown.descriptionBytes).toBe(0);
		expect(breakdown.inputSchemaBytes).toBe(0);
		expect(breakdown.outputSchemaBytes).toBe(0);
		expect(sumComponents(breakdown)).toBe(breakdown.totalBytes);
	});

	it('sums to the whole for every real tool in a live preset surface', async () => {
		const workspace = createTokenBudgetFixtureWorkspace();
		try {
			const connection = await connectTokenBudgetClient(workspace, {
				pluginList: asPresetId('minimal'),
				preset: true,
			});
			try {
				const metrics = await listToolsMetrics(
					connection.client,
					connection.pluginIds,
				);
				expect(metrics.toolBreakdowns.length).toBe(metrics.toolCount);
				for (const breakdown of metrics.toolBreakdowns) {
					expect(sumComponents(breakdown)).toBe(breakdown.totalBytes);
					// The MCP SDK itself attaches an `execution` field to some
					// core tool registrations (e.g. `{ taskSupport: 'forbidden' }`),
					// which `measureSchemaBytes()` in core does not account for.
					// `otherFieldBytes` exists precisely to catch real wire bytes
					// like this one, so it must never be negative.
					expect(breakdown.otherFieldBytes).toBeGreaterThanOrEqual(0);
				}
				// delendai_overview is always registered by core and always
				// carries the SDK's `execution` field, so this real,
				// previously-unaccounted wire cost should show up here.
				const overview = metrics.toolBreakdowns.find(
					(row) => row.name === 'delendai_overview',
				);
				expect(overview?.otherFieldBytes).toBeGreaterThan(0);
				const ownerSum = metrics.ownerRows.reduce(
					(sum, row) => sum + row.toolsListBytes,
					0,
				);
				const breakdownSum = metrics.toolBreakdowns.reduce(
					(sum, row) => sum + row.totalBytes,
					0,
				);
				expect(ownerSum).toBe(breakdownSum);
			} finally {
				await connection.close();
			}
		} finally {
			destroyTokenBudgetFixtureWorkspace(workspace);
		}
	}, 30_000);
});
