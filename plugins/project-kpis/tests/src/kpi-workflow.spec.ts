import { describe, expect, it } from 'vitest';

import { KpiSnapshotOutputSchema } from '../../src/lib/contracts/kpi-snapshot.schema';
import type { IKpiWorkflowSection } from '../../src/lib/contracts/kpi-snapshot.interface';
import { buildKpiSnapshot } from '../../src/lib/services/kpi-aggregation.service';

const workflow: IKpiWorkflowSection = {
	invariants: { total: 12, broken: 1, brokenIds: ['units-are-committed'] },
	units: 3,
	publicationsWaiting: 2,
	agents: 4,
	agentsThatProducedNothing: 1,
};

const options = {
	namespacePrefix: 'delendai',
	workspaceRootAbs: '/workspace',
	usageSummaryPathAbs: '/workspace/usage-summary.json',
	usageInvocationsPathAbs: '/workspace/invocations.jsonl',
	now: new Date('2026-08-29T12:00:00.000Z'),
	pathExists: () => false,
	runProjectHealth: async () => ({
		content: [{ text: '{}' }],
		isError: true,
	}),
};

describe('buildKpiSnapshot workflow block', () => {
	it('carries the state of the work model and still parses', async () => {
		const snapshot = await buildKpiSnapshot({
			...options,
			readWorkflow: async () => workflow,
		});
		expect(snapshot.workflow).toEqual(workflow);
		expect(KpiSnapshotOutputSchema.parse(snapshot)).toEqual(snapshot);
	});

	it('omits the block when the workspace is not a git repository', async () => {
		const snapshot = await buildKpiSnapshot({
			...options,
			readWorkflow: async () => undefined,
		});
		expect(snapshot.workflow).toBeUndefined();
		expect('workflow' in snapshot).toBe(false);
		expect(KpiSnapshotOutputSchema.parse(snapshot)).toEqual(snapshot);
	});
});
