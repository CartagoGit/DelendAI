import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';

import { buildEvalReportToolRegistration } from './eval-report.tool';
import type { IEvalAttempt } from '../eval/eval-harness';

const attempt = (
	providerId: string,
	costTier: number,
	costUsd: number,
	passed: boolean,
): IEvalAttempt => ({ providerId, costTier, costUsd, passed });

describe('eval-report (f00127 S2)', () => {
	it('registers under the namespace prefix', async () => {
		const captured = await captureToolRegistration(
			buildEvalReportToolRegistration({ namespacePrefix: 'eval' }),
		);
		expect(captured.tool.id).toBe('eval_report');
	});

	it('returns the ranked report + markdown table', async () => {
		const captured = await captureToolRegistration(
			buildEvalReportToolRegistration({ namespacePrefix: 'eval' }),
		);
		const out = (await captured.invoke({
			attempts: [
				attempt('cheap', 1, 0.02, true),
				attempt('quality', 4, 0.1, true),
				attempt('flaky', 3, 0.5, false),
			],
		})) as Record<string, unknown>;
		expect(out.winner).toBe('cheap');
		expect(out.worst).toBe('flaky');
		expect(out.totalCostUsd).toBeCloseTo(0.62, 6);
		expect(out.totalPasses).toBe(2);
		const rows = out.rows as Array<{ providerId: string }>;
		expect(rows[0]?.providerId).toBe('cheap');
		const md = out.markdown as string;
		expect(md).toContain('| Provider |');
		expect(md).toContain('cheap');
		expect(md).toContain('quality');
	});

	it('returns a structured error envelope on empty attempts', async () => {
		const captured = await captureToolRegistration(
			buildEvalReportToolRegistration({ namespacePrefix: 'eval' }),
		);
		const result = await captured.invokeRaw({ attempts: [] });
		expect(result.isError).toBe(true);
	});

	it('surfaces winner=null when no provider passed', async () => {
		const captured = await captureToolRegistration(
			buildEvalReportToolRegistration({ namespacePrefix: 'eval' }),
		);
		const out = (await captured.invoke({
			attempts: [
				attempt('a', 3, 0.5, false),
				attempt('b', 4, 0.1, false),
			],
		})) as Record<string, unknown>;
		expect(out.winner).toBe(null);
		expect(out.worst).toBe('a');
	});
});
