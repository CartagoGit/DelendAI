import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	STARTUP_ACTIVATION_BUDGET_MS,
	STARTUP_ACTIVATION_WORK_BUDGET,
	type IActivationScenarioSample,
	analyzeActivationEvents,
	runActivationBenchmark,
} from '../benchmarks/activation-benchmark';

const manifestEvents = [
	'onStartupFinished',
	'onView:mcp-vertex.tools',
	'workspaceContains:**/mcp-vertex.config.json',
] as const;

const sample = (
	scenario: IActivationScenarioSample['scenario'],
	overrides: Partial<IActivationScenarioSample>,
): IActivationScenarioSample => ({
	scenario,
	startupReadyMs: 0,
	activationProbeMs: 0,
	heapUsedBytes: 1024,
	heapDeltaBytes: 256,
	workUnits: 12,
	observedToolCalls: 0,
	observedToolCallsEvidence: 'artifact',
	activatedBeforeProbe: true,
	activationEvents: manifestEvents,
	limitation: null,
	...overrides,
});

describe('activation benchmark', () => {
	it('documents onStartupFinished and lazy fallback events from the manifest', () => {
		const evidence = analyzeActivationEvents(manifestEvents);

		expect(evidence.startupEventPresent).toBe(true);
		expect(evidence.lazyFallbackEvents).toEqual([
			'onView:mcp-vertex.tools',
			'workspaceContains:**/mcp-vertex.config.json',
		]);
		expect(evidence.fallbackDocumentation).toContain('onStartupFinished');
		expect(evidence.fallbackDocumentation).toContain(
			'workspaceContains:**/mcp-vertex.config.json',
		);
	});

	it('summarizes real-host measurements and decides from control/no-MCP/MCP evidence', async () => {
		const queue = [
			sample('control', {
				startupReadyMs: 12,
				heapDeltaBytes: 100,
				workUnits: 0,
			}),
			sample('workspace-no-mcp', {
				startupReadyMs: 30,
				heapDeltaBytes: 180,
				workUnits: 18,
				observedToolCalls: 0,
			}),
			sample('workspace-mcp', {
				startupReadyMs: 33,
				heapDeltaBytes: 220,
				workUnits: 20,
				observedToolCalls: 2,
			}),
			sample('control', {
				startupReadyMs: 10,
				heapDeltaBytes: 96,
				workUnits: 0,
			}),
			sample('workspace-no-mcp', {
				startupReadyMs: 31,
				heapDeltaBytes: 176,
				workUnits: 16,
				observedToolCalls: 0,
			}),
			sample('workspace-mcp', {
				startupReadyMs: 35,
				heapDeltaBytes: 224,
				workUnits: 21,
				observedToolCalls: 3,
			}),
		];
		const report = await runActivationBenchmark({
			activationEvents: manifestEvents,
			iterations: 2,
			build: false,
			keepEvidence: true,
			executeScenario: async () => {
				const next = queue.shift();
				if (next === undefined) throw new Error('missing test sample');
				return next;
			},
		});

		expect(report.harness.mode).toBe('official-vscode-test-electron');
		expect(report.control?.iterations).toBe(2);
		expect(report.control?.totalObservedToolCalls).toBe(0);
		expect(report.control?.missingObservedToolCallEvidenceCount).toBe(0);
		expect(report.workspaceNoMcp?.totalObservedToolCalls).toBe(0);
		expect(
			report.workspaceNoMcp?.missingObservedToolCallEvidenceCount,
		).toBe(0);
		expect(report.workspaceMcp?.totalObservedToolCalls).toBe(5);
		expect(report.workspaceMcp?.missingObservedToolCallEvidenceCount).toBe(
			0,
		);
		expect(report.decision.status).toBe('measured');
		expect(report.decision.keepOnStartupFinished).toBe(true);
		expect(report.decision.startupOverheadMs).toBeLessThanOrEqual(
			STARTUP_ACTIVATION_BUDGET_MS,
		);
		expect(report.decision.startupWorkUnits).toBeLessThanOrEqual(
			STARTUP_ACTIVATION_WORK_BUDGET,
		);
		expect(report.decision.rationale).toContain(
			'Official VS Code extension-host measurements',
		);
	});

	it('classifies insufficient evidence when no-MCP lacks a real observedToolCalls artifact', async () => {
		const queue = [
			sample('control', {
				startupReadyMs: 12,
				workUnits: 0,
			}),
			sample('workspace-no-mcp', {
				startupReadyMs: 29,
				observedToolCalls: null,
				observedToolCallsEvidence: 'missing-artifact',
			}),
			sample('workspace-mcp', {
				startupReadyMs: 33,
				observedToolCalls: 2,
			}),
		];
		const report = await runActivationBenchmark({
			activationEvents: manifestEvents,
			iterations: 1,
			build: false,
			keepEvidence: true,
			executeScenario: async () => {
				const next = queue.shift();
				if (next === undefined) throw new Error('missing test sample');
				return next;
			},
		});

		expect(report.harness.mode).toBe('official-vscode-test-electron');
		expect(report.workspaceNoMcp?.totalObservedToolCalls).toBeNull();
		expect(
			report.workspaceNoMcp?.missingObservedToolCallEvidenceCount,
		).toBe(1);
		expect(report.decision.status).toBe('insufficient-evidence');
		expect(report.decision.keepOnStartupFinished).toBeNull();
		expect(report.decision.rationale).toContain('workspace-no-mcp');
		expect(report.decision.rationale).toContain('observedToolCalls');
	});

	it('returns explicit limitation evidence when the official harness cannot run', async () => {
		const report = await runActivationBenchmark({
			activationEvents: manifestEvents,
			iterations: 1,
			build: false,
			keepEvidence: true,
			executeScenario: async () => {
				throw {
					phase: 'launch',
					reason: 'vscode-runtime-unavailable',
					message: 'Missing display libraries for Electron',
					scenario: 'control',
				};
			},
		});

		expect(report.harness.mode).toBe('limitation');
		expect(report.harness.limitation?.reason).toBe(
			'vscode-runtime-unavailable',
		);
		expect(report.control).toBeNull();
		expect(report.workspaceNoMcp).toBeNull();
		expect(report.workspaceMcp).toBeNull();
		expect(report.decision.status).toBe('insufficient-evidence');
		expect(report.decision.keepOnStartupFinished).toBeNull();
		expect(report.decision.rationale).toContain('@vscode/test-electron');
		expect(report.decision.rationale).toContain(
			'No real VS Code activation evidence',
		);
	});

	it('treats an empty call-log artifact as missing evidence instead of zero observed calls', async () => {
		const tmp = mkdtempSync(join(tmpdir(), 'mcp-vertex-bench-empty-'));
		const emptyLog = join(tmp, 'empty.jsonl');
		writeFileSync(emptyLog, '', 'utf8');
		const queue = [
			sample('control', {
				startupReadyMs: 12,
				workUnits: 0,
				observedToolCalls: null,
				observedToolCallsEvidence: 'missing-artifact',
			}),
			sample('workspace-no-mcp', {
				startupReadyMs: 29,
				observedToolCalls: null,
				observedToolCallsEvidence: 'missing-artifact',
			}),
			sample('workspace-mcp', {
				startupReadyMs: 33,
				observedToolCalls: 2,
				observedToolCallsEvidence: 'artifact',
			}),
		];
		try {
			const report = await runActivationBenchmark({
				activationEvents: manifestEvents,
				iterations: 1,
				build: false,
				keepEvidence: true,
				executeScenario: async (request) => {
					const next = queue.shift();
					if (next === undefined) {
						throw new Error('missing test sample');
					}
					if (request.callLogPath !== undefined) {
						writeFileSync(request.callLogPath, '', 'utf8');
					}
					return next;
				},
			});

			expect(report.workspaceNoMcp?.totalObservedToolCalls).toBeNull();
			expect(
				report.workspaceNoMcp?.missingObservedToolCallEvidenceCount,
			).toBe(1);
			expect(report.decision.status).toBe('insufficient-evidence');
			expect(report.decision.keepOnStartupFinished).toBeNull();
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});
