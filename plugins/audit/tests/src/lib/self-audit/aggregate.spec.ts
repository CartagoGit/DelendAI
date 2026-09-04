/**
 * aggregate.spec.ts — f00139 S1 acceptance: the pure self-audit
 * aggregator must produce a single ranked backlog from every
 * injected scanner and stay resilient when one is missing.
 *
 * Verifies:
 *  - empty scanner map → valid empty report (worst: 'none');
 *  - multiple scanners → all findings folded into `aggregated.findings`;
 *  - scanner that returned `{skipped: true}` flows into `skipped[]`;
 *  - scanner that THREW becomes a skipped entry with the error note
 *    (the "missing ones skipped with a note" invariant);
 *  - `capabilities` tallys one entry per scanner ref tag;
 *  - `ranAt` is an ISO timestamp.
 */

import { describe, expect, it } from 'vitest';

import {
	aggregateSelfAudit,
	defaultScannerMap,
} from '../../../../src/lib/self-audit/aggregate';
import type {
	ISelfAuditOptions,
	ISelfAuditScannerRef,
	ISelfAuditScannerRunner,
} from '../../../../src/lib/contracts/interfaces/self-audit.interface';
import type { IFinding, IScanResult } from '@delendai/core/public';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const finding = (
	ruleId: string,
	severity: IFinding['severity'],
	message = ruleId,
): IFinding => ({ ruleId, severity, message });

const result = (
	tool: string,
	over: Partial<IScanResult> = {},
): IScanResult => ({
	tool,
	findings: [],
	summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
	ranAt: '2026-07-26T00:00:00.000Z',
	...over,
});

const ref = (
	id: string,
	capability: string,
	label = id,
): ISelfAuditScannerRef => ({ id, label, capability });

const scannerEntry = (
	id: string,
	capability: string,
	scannerResult: IScanResult,
) => ({
	ref: ref(id, capability),
	run: (async () => scannerResult) as ISelfAuditScannerRunner,
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('aggregateSelfAudit — happy path', () => {
	it("folds every scanner's findings into one aggregated backlog", async () => {
		const scanners = new Map<string, ReturnType<typeof scannerEntry>>([
			[
				'secrets',
				scannerEntry(
					'secrets',
					'security',
					result('secrets', {
						findings: [finding('aws', 'critical', 'AWS key')],
					}),
				),
			],
			[
				'deps',
				scannerEntry(
					'deps',
					'security',
					result('deps', {
						findings: [finding('cve', 'high', 'CVE-2024')],
					}),
				),
			],
			[
				'perf',
				scannerEntry(
					'perf',
					'perf',
					result('perf', {
						findings: [finding('bundle', 'medium', 'big bundle')],
					}),
				),
			],
		]);

		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/tmp/repo',
			scanners,
		});

		expect(report.scannerCount).toBe(3);
		expect(report.skipped).toEqual([]);
		expect(report.aggregated.tools).toEqual(['secrets', 'deps', 'perf']);
		expect(report.aggregated.findings.map((f) => f.severity)).toEqual([
			'critical',
			'high',
			'medium',
		]);
		expect(report.worst).toBe('critical');
		// per-capability tally
		expect(report.capabilities).toEqual({ security: 2, perf: 1 });
	});

	it('handles the empty scanner map as a no-op aggregation', async () => {
		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/tmp/repo',
		});
		expect(report.scannerCount).toBe(0);
		expect(report.skipped).toEqual([]);
		expect(report.aggregated.tools).toEqual([]);
		expect(report.aggregated.findings).toEqual([]);
		expect(report.worst).toBe('none');
		expect(report.capabilities).toEqual({});
	});

	it('uses defaultScannerMap() when callers omit scanners', async () => {
		// The default map must be a fresh empty Map per call (no shared state).
		const a = defaultScannerMap();
		const b = defaultScannerMap();
		expect(a).not.toBe(b);
		expect(a.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Resilience
// ---------------------------------------------------------------------------

describe('aggregateSelfAudit — resilience', () => {
	it('keeps a scanner that returned {skipped:true} flowing through', async () => {
		const scanners = new Map<string, ReturnType<typeof scannerEntry>>([
			[
				'secrets',
				scannerEntry(
					'secrets',
					'security',
					result('secrets', {
						findings: [finding('aws', 'critical')],
					}),
				),
			],
			[
				'bun-audit',
				scannerEntry(
					'bun-audit',
					'security',
					result('bun-audit', {
						skipped: true,
						note: 'bun not installed',
					}),
				),
			],
		]);

		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/tmp/repo',
			scanners,
		});

		// active scanner stays in aggregated.tools
		expect(report.aggregated.tools).toEqual(['secrets']);
		// skipped scanner surfaces in BOTH aggregated.skipped AND report.skipped
		expect(report.aggregated.skipped).toEqual([
			{ tool: 'bun-audit', note: 'bun not installed' },
		]);
		expect(report.skipped).toEqual([
			{ id: 'bun-audit', note: 'bun not installed' },
		]);
		// secrets returned a critical, so worst must be 'critical'
		expect(report.worst).toBe('critical');
	});

	it('converts a thrown runner into a skipped result with the error note', async () => {
		const scanners = new Map<string, ReturnType<typeof scannerEntry>>([
			[
				'broken',
				{
					ref: ref('broken', 'security'),
					run: async () => {
						throw new Error('sandbox unavailable');
					},
				},
			],
			[
				'ok',
				scannerEntry(
					'ok',
					'security',
					result('ok', {
						findings: [finding('x', 'low')],
					}),
				),
			],
		]);

		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/tmp/repo',
			scanners,
		});

		expect(report.skipped).toEqual([
			{ id: 'broken', note: 'sandbox unavailable' },
		]);
		expect(report.aggregated.skipped).toEqual([
			{ tool: 'broken', note: 'sandbox unavailable' },
		]);
		// the other scanner still produces findings
		expect(report.aggregated.tools).toEqual(['ok']);
		expect(report.worst).toBe('low');
	});

	it('converts a thrown non-Error into a stringified skipped note', async () => {
		const scanners = new Map<string, ReturnType<typeof scannerEntry>>([
			[
				'weird',
				{
					ref: ref('weird', 'misc'),
					run: async () => {
						// A scanner throwing a non-Error value is the exact
						// defensive case this test pins.
						throw 'plain string error';
					},
				},
			],
		]);

		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/tmp/repo',
			scanners,
		});

		expect(report.skipped).toEqual([
			{ id: 'weird', note: 'plain string error' },
		]);
	});
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('aggregateSelfAudit — metadata', () => {
	it('stamps the report with an ISO timestamp', async () => {
		const before = Date.now();
		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/tmp/repo',
		});
		const after = Date.now();
		const stamped = Date.parse(report.ranAt);
		expect(Number.isFinite(stamped)).toBe(true);
		// tolerate tiny clock skew
		expect(stamped).toBeGreaterThanOrEqual(before - 5_000);
		expect(stamped).toBeLessThanOrEqual(after + 5_000);
	});

	it('threads the workspaceRootAbs through to every runner', async () => {
		let captured: string | undefined;
		const scanners = new Map<string, ReturnType<typeof scannerEntry>>([
			[
				'capture',
				{
					ref: ref('capture', 'misc'),
					run: async (root: string) => {
						captured = root;
						return result('capture', {
							findings: [finding('y', 'info')],
						});
					},
				},
			],
		]);
		await aggregateSelfAudit({
			workspaceRootAbs: '/var/repos/proj',
			scanners,
		});
		expect(captured).toBe('/var/repos/proj');
	});

	it('does not mutate the input options or scanners map', async () => {
		const scanners = new Map<string, ReturnType<typeof scannerEntry>>([
			[
				'one',
				scannerEntry(
					'one',
					'security',
					result('one', {
						findings: [finding('a', 'high')],
					}),
				),
			],
		]);
		const options: ISelfAuditOptions = {
			workspaceRootAbs: '/tmp/repo',
			scanners,
		};
		const beforeSize = scanners.size;
		await aggregateSelfAudit(options);
		expect(scanners.size).toBe(beforeSize);
		expect(options.workspaceRootAbs).toBe('/tmp/repo');
	});
});
