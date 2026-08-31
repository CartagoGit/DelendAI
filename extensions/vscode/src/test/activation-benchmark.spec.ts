import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	STARTUP_ACTIVATION_BUDGET_MS,
	STARTUP_ACTIVATION_WORK_BUDGET,
	runActivationBenchmark,
} from '../benchmarks/activation-benchmark';

const manifestPath = resolve(import.meta.dirname, '../../package.json');

const readActivationEvents = async (): Promise<readonly string[]> => {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
		activationEvents?: readonly string[];
	};
	return manifest.activationEvents ?? [];
};

describe('activation benchmark', () => {
	it('measures startup overhead with and without MCP launch and keeps lazy fallback evidence', async () => {
		const activationEvents = await readActivationEvents();
		const report = await runActivationBenchmark(activationEvents);

		expect(report.control.iterations).toBe(9);
		expect(report.workspaceNoMcp.iterations).toBe(9);
		expect(report.workspaceMcp.iterations).toBe(9);
		expect(report.workspaceNoMcp.totalClientConnects).toBe(0);
		expect(report.workspaceMcp.totalClientConnects).toBeGreaterThan(0);
		expect(report.workspaceNoMcp.medianWorkUnits).toBeGreaterThan(0);
		expect(report.workspaceMcp.medianWorkUnits).toBeGreaterThan(
			report.workspaceNoMcp.medianWorkUnits,
		);
		expect(report.manifest.startupEventPresent).toBe(true);
		expect(report.manifest.lazyFallbackEvents).toContain(
			'onView:mcp-vertex.tools',
		);
		expect(report.manifest.lazyFallbackEvents).toContain(
			'workspaceContains:**/mcp-vertex.config.json',
		);
		expect(report.decision.keepOnStartupFinished).toBe(true);
		expect(report.decision.lazyFallbackReady).toBe(true);
		expect(report.decision.startupOverheadMs).toBeLessThanOrEqual(
			STARTUP_ACTIVATION_BUDGET_MS,
		);
		expect(report.decision.startupWorkUnits).toBeLessThanOrEqual(
			STARTUP_ACTIVATION_WORK_BUDGET,
		);
		expect(report.decision.rationale).toContain('lazy fallbacks');
	});

	it('produces finite timing and memory samples for reproducible evidence', async () => {
		const activationEvents = await readActivationEvents();
		const report = await runActivationBenchmark(activationEvents, 5, 1);

		for (const scenario of [
			report.control,
			report.workspaceNoMcp,
			report.workspaceMcp,
		]) {
			expect(Number.isFinite(scenario.medianMs)).toBe(true);
			expect(Number.isFinite(scenario.p95Ms)).toBe(true);
			expect(Number.isFinite(scenario.medianHeapDeltaBytes)).toBe(true);
			expect(scenario.samples).toHaveLength(5);
		}
	});
});
