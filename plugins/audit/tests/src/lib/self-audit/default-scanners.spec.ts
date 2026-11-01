/**
 * default-scanners.spec.ts — the scanners the public self_audit
 * registration runs when none are injected.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@delendai/security/public', () => ({
	realScanDeps: (root: string) => ({ root }),
	runSecretScan: async () => ({
		scanned: 1,
		findings: [{ ruleId: 'aws-key', severity: 'critical', message: 'key' }],
		ignoredScanned: [],
		ignoredSkipped: 0,
	}),
}));
vi.mock('@delendai/deps/public', () => ({
	runDepsAudit: async () => ({
		tool: 'bun-audit',
		findings: [],
		summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
		ranAt: '2026-01-01T00:00:00.000Z',
	}),
}));

import { aggregateSelfAudit } from '../../../../src/lib/self-audit/aggregate';
import { buildDefaultScanners } from '../../../../src/lib/self-audit/default-scanners.service';

describe('buildDefaultScanners', () => {
	it('registers the secret and dependency scanners with their capabilities', () => {
		const scanners = buildDefaultScanners();
		expect([...scanners.values()].map((s) => s.ref.capability)).toEqual([
			'security',
			'deps',
		]);
	});

	it('produces findings through the aggregator', async () => {
		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/ws',
			scanners: buildDefaultScanners(),
		});
		expect(report.scannerCount).toBe(2);
		expect(report.aggregated.findings.map((f) => f.ruleId)).toEqual([
			'aws-key',
		]);
		expect(report.worst).toBe('critical');
	});

	it('runs only the requested capability and reports the other as skipped', async () => {
		const report = await aggregateSelfAudit({
			workspaceRootAbs: '/ws',
			scanners: buildDefaultScanners(),
			capabilities: ['deps'],
		});
		expect(report.aggregated.findings).toEqual([]);
		expect(report.skipped).toEqual([
			{ id: 'secrets', note: 'capability security not requested' },
		]);
		expect(report.capabilities).toEqual({ deps: 1 });
	});
});
