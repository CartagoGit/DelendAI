import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	TASK_CONTEXT_CORPUS,
	measureToolResultPayloadBytes,
	nearestRankPercentile,
	summarizeBytePercentiles,
} from '../../../../../../tools/scripts/measure/catalog-task-context-cost';

const WORKSPACE_ROOT = fileURLToPath(
	new URL('../../../../../../', import.meta.url),
);

const runMeasurementScript = (): string =>
	execFileSync(
		'bun',
		['tools/scripts/measure/catalog-task-context-cost.script.ts'],
		{
			cwd: WORKSPACE_ROOT,
			encoding: 'utf8',
			env: {
				...process.env,
				VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
			},
		},
	);

describe('catalog-task-context-cost measurement', () => {
	it('computes nearest-rank percentiles for reproducible byte samples', () => {
		const samples = [682, 738, 786, 834];
		expect(nearestRankPercentile(samples, 50)).toBe(738);
		expect(nearestRankPercentile(samples, 95)).toBe(834);
		expect(summarizeBytePercentiles(samples)).toEqual({
			sampleCount: 4,
			p50Bytes: 738,
			p95Bytes: 834,
			p50EstimatedTokens: 185,
			p95EstimatedTokens: 209,
		});
	});

	it('prefers structuredContent and falls back to joined text payloads', () => {
		expect(
			measureToolResultPayloadBytes({
				content: [{ type: 'text', text: 'short summary' }],
				structuredContent: {
					ok: true,
					counts: { tools: 29, skills: 8, proposals: 0 },
				},
			}),
		).toBe(
			Buffer.byteLength(
				JSON.stringify({
					ok: true,
					counts: { tools: 29, skills: 8, proposals: 0 },
				}),
				'utf8',
			),
		);
		expect(
			measureToolResultPayloadBytes({
				content: [
					{ type: 'text', text: 'line one' },
					{ type: 'resource', text: 'ignored' },
					{ type: 'text', text: 'line two' },
				],
			}),
		).toBe(Buffer.byteLength('line one\nline two', 'utf8'));
	});

	it('measures catalog payloads and a reproducible swarm task-context corpus', () => {
		const output = runMeasurementScript();

		expect(output).toContain(
			'| agent_catalog compact | native | 743 | 186 |',
		);
		expect(output).toContain(
			'| agent_catalog full | native | 9,519 | 2,380 |',
		);
		expect(output).toContain(
			'| native core catalog | 28 | 42,768 | 36,508 | 11,533 | 24,975 | 0 |',
		);
		// These numbers are a ratchet, not a constant: every field added
		// to a tool's outputSchema is paid for on every agent's surface.
		// 2026-09-02 — 193,678 → 194,616 for the fields that stop two
		// closing-path refusals from looping (`await_lock`'s timeout
		// verdict/holder/nextAction and `close_slice`'s blockingReasons).
		// ~940 bytes of schema to remove an unbounded retry loop is a
		// trade worth recording rather than hiding.
		expect(output).toContain(
			'| swarm native preset | 166 | 194,616 | 158,925 | 48,071 | 110,854 | 50,887 |',
		);
		for (const step of TASK_CONTEXT_CORPUS) {
			expect(output).toContain(`| ${step.label} |`);
		}
		expect(output).toContain('| cold start | 682 | 171 |');
		expect(output).toContain('| after search.search | 738 | 185 |');
		expect(output).toContain('| after docs.docs_list | 786 | 197 |');
		expect(output).toContain('| after logs.tail | 834 | 209 |');
		expect(output).toContain('| p50 | 738 | 185 |');
		expect(output).toContain('| p95 | 834 | 209 |');
	});
});
