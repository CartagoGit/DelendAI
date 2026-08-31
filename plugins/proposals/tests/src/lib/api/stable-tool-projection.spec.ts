import { describe, expect, it } from 'vitest';

import type { IStableManifestTool } from '@mcp-vertex/core/public';

import { projectProposalsStableTools } from '@mcp-vertex/proposals/lib/api/stable-tool-projection';
import { PROPOSALS_STABLE_TOOL_SURFACE } from '@mcp-vertex/proposals/lib/api/proposals-stable-tools';

const surfaceRows = (): readonly IStableManifestTool[] =>
	projectProposalsStableTools({ mode: 'full' })
		.value as readonly IStableManifestTool[];

const compactRows = (): readonly IStableManifestTool[] =>
	projectProposalsStableTools({ mode: 'compact' })
		.value as readonly IStableManifestTool[];

const fieldsRows = (): readonly IStableManifestTool[] =>
	projectProposalsStableTools({
		fields: ['name', 'plugin', 'sinceVersion'],
	}).value as readonly IStableManifestTool[];

const limitedRows = (): readonly IStableManifestTool[] =>
	projectProposalsStableTools({ limit: 3 })
		.value as readonly IStableManifestTool[];

describe('stable-tool projection — v00133 S2', () => {
	it('preserves every field when projection is full', () => {
		const result = projectProposalsStableTools({ mode: 'full' });
		expect(result.truncated).toBe(false);
		expect(result.mode).toBe('full');
		expect(result.value).toEqual(PROPOSALS_STABLE_TOOL_SURFACE);
	});

	it('keeps proposals_close_plan serializable with a non-null outputSchema', () => {
		const closePlan = surfaceRows().find(
			(row) => row.name === 'proposals_close_plan',
		) as
			| (IStableManifestTool & {
					outputSchema?: {
						type?: string;
						properties?: Record<string, unknown>;
					};
			  })
			| undefined;

		expect(closePlan).toBeDefined();
		expect(closePlan?.outputSchema).not.toBeNull();
		expect(closePlan?.outputSchema?.type).toBe('object');
		expect(closePlan?.outputSchema?.properties).toHaveProperty('dryRun');
	});

	it('runs over the serializable detailed surface, not the internal descriptors', () => {
		const rows = surfaceRows();
		expect(rows.length).toBe(PROPOSALS_STABLE_TOOL_SURFACE.length);
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual([
				'inputSchema',
				'name',
				'outputSchema',
				'plugin',
				'semverGuarantee',
				'sinceVersion',
				'summary',
			]);
		}
	});

	it('returns only the curated compact subset by default', () => {
		const rows = compactRows();
		for (const row of rows) {
			const keys = Object.keys(row).sort();
			expect(
				keys.every((key) =>
					[
						'id',
						'name',
						'plugin',
						'summary',
						'kind',
						'type',
						'description',
					].includes(key),
				),
			).toBe(true);
		}
	});

	it('honors an explicit fields allow-list', () => {
		const rows = fieldsRows();
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual([
				'name',
				'plugin',
				'sinceVersion',
			]);
		}
	});

	it('emits a nextCursor when limit truncates the catalog', () => {
		const result = projectProposalsStableTools({ limit: 3 });
		expect(result.limit).toBe(3);
		expect(limitedRows().length).toBe(3);
		expect(result.nextCursor).toBe('offset:3');
	});
});
