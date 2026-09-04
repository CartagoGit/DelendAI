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
			'| agent_catalog compact | native | 727 | 182 |',
		);
		expect(output).toContain(
			'| agent_catalog full | native | 9,329 | 2,333 |',
		);
		expect(output).toContain(
			'| native core catalog | 28 | 42,720 | 36,522 | 11,573 | 24,949 | 0 |',
		);
		// These numbers are a ratchet, not a constant: every field added
		// to a tool's outputSchema is paid for on every agent's surface.
		// 2026-09-02 — 193,678 → 194,616 for the fields that stop two
		// closing-path refusals from looping (`await_lock`'s timeout
		// verdict/holder/nextAction and `close_slice`'s blockingReasons).
		// ~940 bytes of schema to remove an unbounded retry loop is a
		// trade worth recording rather than hiding.
		// 2026-09-03 — 194,616 → 197,637 and 166 → 167 tools. Two
		// movements in opposite directions, recorded separately because
		// the net figure hides both: q00016 S7 cut `project_kpis`'s
		// outputSchema from 8,518 B to 2,895 B (86% of that one tool's
		// discovery cost was describing its own output), while a newly
		// registered tool and the capability-graph work added more than
		// the saving. The ratchet is doing its job precisely by making a
		// 3 KB increase visible instead of letting the S7 win absorb it.
		// 2026-09-04 — 197,637 → 196,597, a 1,040-byte REDUCTION, and the
		// only entry here that nobody designed. The product was renamed
		// and the new name is two characters shorter, so every one of the
		// 167 tool names, every namespaced id inside every schema, and
		// every routed action string lost two bytes. It is a reminder that
		// this surface is paid for per tool per agent per session: two
		// characters, multiplied by the catalog, is a kilobyte off every
		// cold start.
		expect(output).toContain(
			'| swarm native preset | 167 | 196,597 | 161,036 | 48,908 | 112,128 | 51,852 |',
		);
		for (const step of TASK_CONTEXT_CORPUS) {
			expect(output).toContain(`| ${step.label} |`);
		}
		expect(output).toContain('| cold start | 672 | 168 |');
		expect(output).toContain('| after search.search | 728 | 182 |');
		expect(output).toContain('| after docs.docs_list | 776 | 194 |');
		expect(output).toContain('| after logs.tail | 824 | 206 |');
		expect(output).toContain('| p50 | 728 | 182 |');
		expect(output).toContain('| p95 | 824 | 206 |');
	});
});
