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
			'| agent_catalog compact | native | 745 | 187 |',
		);
		expect(output).toContain(
			'| agent_catalog full | native | 10,018 | 2,505 |',
		);
		// 2026-09-15 — core catalog 43,836 -> 44,752 B, tool count unchanged.
		// The 916 B are output schemas declaring what their tools already
		// returned: plugin_search entries (permissions, configDocs,
		// tokenBudgetBytes, toolPermissions, startupActivation, example) and
		// adopt_project's cost.surfaceMode. A client that listed tools
		// rejected both answers for the undeclared keys.
		expect(output).toContain(
			'| native core catalog | 30 | 44,752 | 36,826 | 10,522 | 26,304 | 0 |',
		);
		// 2026-09-10 — core catalog 47,031 -> 47,120 B and swarm 235,431 ->
		// 235,640 B, with the tool COUNT unchanged in both. This is the
		// `title` field becoming visible: the wire has always carried one
		// per tool and the measurement basis never counted it, so every
		// number above this line under-reported the real surface by ~2%.
		// The 89 B on the core catalog buys 30 distinct titles where the
		// same constant string was repeated 30 times; the swarm's 120 B is
		// the same field across a larger roster. Nothing grew — the
		// measurement stopped lying.
		//
		// 2026-09-09 — core catalog 28 -> 30 tools, 42,720 -> 47,031 B, and
		// the swarm preset 167 -> 188 tools, 196,597 -> 235,431 B. The
		// surface genuinely grew, so the ratchet is re-pinned rather than
		// relaxed — and 235,431 B is over swarm's 210,000 B hard budget,
		// which is exactly what v00135 exists to decide. Re-pinning here
		// records the number; it does not approve it. The last 25 B are
		// the `code` field added to PROPOSAL_TRANSITION_OUTPUT_SCHEMA, and
		// this ratchet catching them is exactly the point the audit makes:
		// every field on an outputSchema is paid for on every surface.
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
		// 2026-09-14 — 235,640 → 236,166, a 526-byte increase, and this
		// one WAS designed: `memory_compaction_check` gained `binding`
		// plus two trigger values, and `memory_compact` gained `trigger`,
		// which is what makes an automatic compaction refusable. Every
		// preset carrying the memory plugin pays it, and the entry is
		// here so the next person can see what it bought.
		// v00135 (2026-09-15): `swarm` lists only essential tools by
		// default. Was `| 188 | 236,166 | 189,580 | 54,414 | 135,166 |
		// 75,771 |`; the 39 contextual and administrative tools are still
		// callable through the router, and `proposals` drops from 75,771 B
		// to 15,949 B of static surface.
		// 2026-09-15 — swarm 160,067 -> 160,126 B, tool count unchanged.
		// The 59 B are `close_slice`'s outputSchema `kind` enum gaining the
		// three kinds its handler already returned (validation-error,
		// quality-failed, peer-review-required). Without them a client that
		// listed tools rejected every blocked close with -32602.
		// 2026-09-15 — swarm 160,126 -> 161,042 B, tool count unchanged: the
		// same 916 B of core output schemas as the core catalog row above.
		// 2026-09-15 — swarm 161,042 -> 160,451 B, 149 -> 148 tools, a
		// 591-byte REDUCTION. `agent-orchestrator_budget` is gone: it
		// listed a second schema for figures `_dispatch` already returns
		// and answered 0 for both token ceilings on every call. What it
		// spent now comes back through `_plan_ref`, beside the real
		// ceilings. Done because `standard` was over its 11,000 B
		// marginal ceiling while no gate enforced it.
		// 2026-09-16 — swarm 160,451 -> 160,495 B, tool count unchanged: the
		// 44 B are `create_proposal`'s new required `nextAction`, the step
		// that publishes a written proposal. Without it an agent stopped at
		// the file and left eight proposals untracked in a shared checkout.
		// 2026-09-16 (later) — swarm 160,495 -> 160,605 B, tool count still
		// 148. The 110 B are `create_proposal`'s `published`,
		// `publishedRef` and `publishReason`: the tool now PERFORMS the
		// publication instead of returning instructions, so it reports what
		// it did and what is still owed. The delta lands entirely in output
		// schemas (88,766 -> 88,876) with inputs untouched at 35,815, and
		// the whole 110 B shows up in the max-plugin column
		// (15,111 -> 15,221) because proposals is the heaviest plugin —
		// which is what an output-only change to one of its tools looks
		// like. Advice that an agent could skip was worth 44 B; the machinery
		// that makes skipping impossible costs 110 more.
		// 2026-09-16 (later still) — swarm 160,605 -> 161,396 B, 148 -> 149
		// tools. The 791 B are `conventions_suggest_path` (f00549 S2): the
		// tool that answers where a new file belongs, verified against
		// `classifyPath` before it answers so it can never suggest a path
		// its own classifier calls `other`. The delta splits 147 B of input
		// schema (35,815 -> 35,962) and 383 B of output schema
		// (88,876 -> 89,259), together the 530 B of schema growth
		// (124,691 -> 125,221); the remaining 261 B are the tool's name,
		// description and envelope. The max-plugin column is unchanged at
		// 15,221 because `conventions` carries three tools totalling under
		// 3 KB and `proposals` is still the heaviest plugin — which is what
		// a new tool in a small plugin looks like.
		// 2026-09-16 (S3) — swarm 161,396 -> 162,377 B, 149 -> 150 tools. The
		// 981 B are `conventions_explain_path` (f00549 S3): given a path it
		// answers the role, WHICH rule assigned it, the layer it sits in and
		// what that layer may not import, each rule naming the `lint:*`
		// script that enforces it. The delta splits 77 B of input schema
		// (35,962 -> 36,039) and 628 B of output schema (89,259 -> 89,887),
		// together the 705 B of schema growth (125,221 -> 125,926); the
		// remaining 276 B are the tool's name, description and envelope. The
		// output schema carries most of it because the answer is structured
		// — an array of {forbids, enforcedBy, because} rather than a string.
		// Max-plugin is unchanged at 15,221: `conventions` now has four
		// tools and is still far below `proposals`.
		// 2026-09-17 (S4) — swarm 162,377 -> 163,859 B, 150 -> 151 tools. The
		// 1,482 B are `conventions_check_architecture` (f00549 S4): it
		// reports forbidden imports per layer rule exactly as the enforcing
		// lint would, and says how many files each detector read so a green
		// report over nothing cannot pass for a clean tree. The delta splits
		// 137 B of input schema (36,039 -> 36,176) and 1,078 B of output
		// schema (89,887 -> 90,965), together 1,215 B of schema growth
		// (125,926 -> 127,141); the remaining 267 B are the tool's name,
		// description and envelope. Output carries most of it because each
		// finding is structured (file, line, specifier, rule, enforcer,
		// baseline key) and the per-detector sample is part of the answer.
		// Max-plugin is unchanged at 15,221: `conventions` has five tools
		// and `proposals` is still the heaviest plugin.
		expect(output).toContain(
			'| swarm native preset | 151 | 163,859 | 127,141 | 36,176 | 90,965 | 15,221 |',
		);
		for (const step of TASK_CONTEXT_CORPUS) {
			expect(output).toContain(`| ${step.label} |`);
		}
		expect(output).toContain('| cold start | 672 | 168 |');
		expect(output).toContain('| after search.search | 728 | 182 |');
		expect(output).toContain('| after docs.docs_list | 776 | 194 |');
		expect(output).toContain('| after logs.tail | 826 | 207 |');
		expect(output).toContain('| p50 | 728 | 182 |');
		expect(output).toContain('| p95 | 826 | 207 |');
	});
});
