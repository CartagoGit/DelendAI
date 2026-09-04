/**
 * disclosure.spec.ts — q00016 S8.
 *
 * Two layers:
 *
 *  1. Pure-policy tests against `disclosure.ts` directly (no I/O): every
 *     real registration id from the generated eager-assembly catalog has
 *     an assigned level, so adding a registration without classifying it
 *     fails independently from the hand-authored policy module.
 *  2. One real-wire measurement: assemble the actual `proposals` plugin
 *     through the same in-memory MCP harness the other e2e specs use,
 *     `tools/list` for real, and measure the proposals-owned tools'
 *     wire bytes with the repo's own shared byte-counter
 *     (`measureBootstrapBytes` / `measureToolWireBytes`, exported from
 *     `@delendai/core/public`, the same function
 *     `ToolSurfaceRuntime.measureSchemaBytes` and the token-budget
 *     dashboard both use) rather than inventing a second measurement.
 */
import { describe, expect, it } from 'vitest';

import { measureBootstrapBytes } from '@delendai/core/public';
import { MANAGED_LAZY_PLUGIN_BY_ID } from '@delendai/core/lib/plugins/managed-lazy-catalog.generated';

import {
	PROPOSALS_ESSENTIAL_TOOL_IDS,
	PROPOSALS_TOOL_DISCLOSURE,
	PROPOSALS_TOOL_IDS,
	staticDisclosureTagFor,
	type IProposalsToolId,
} from '@delendai/proposals/lib/surface/disclosure';

import { createAssembledProposalsServer } from '../e2e/assembled-proposals-server';

const REAL_REGISTRATION_IDS =
	MANAGED_LAZY_PLUGIN_BY_ID.get('proposals')?.toolIds ?? [];

describe('proposals disclosure policy (q00016 S8) — pure', () => {
	it('has exactly the 34 real registration ids, no more, no fewer', () => {
		expect(REAL_REGISTRATION_IDS).toHaveLength(34);
		expect(new Set(PROPOSALS_TOOL_IDS).size).toBe(34);
		expect([...PROPOSALS_TOOL_IDS].sort()).toEqual(
			[...REAL_REGISTRATION_IDS].sort(),
		);
	});

	it('assigns every real registration id a disclosure level', () => {
		for (const id of REAL_REGISTRATION_IDS) {
			const level = PROPOSALS_TOOL_DISCLOSURE[id as IProposalsToolId];
			expect(level).toBeDefined();
			expect(['essential', 'contextual', 'administrative']).toContain(
				level,
			);
		}
	});

	it('throws for an id with no assigned level — a new tool cannot silently vanish', () => {
		expect(() => staticDisclosureTagFor('totally_new_tool_id')).toThrow(
			/no progressive-disclosure level assigned/,
		);
	});

	it('keeps the essential flow to 4-8 tools, per the plan', () => {
		expect(PROPOSALS_ESSENTIAL_TOOL_IDS.length).toBeGreaterThanOrEqual(4);
		expect(PROPOSALS_ESSENTIAL_TOOL_IDS.length).toBeLessThanOrEqual(8);
	});

	it('exposes the essential flow and nothing else statically', () => {
		for (const id of PROPOSALS_ESSENTIAL_TOOL_IDS) {
			expect(PROPOSALS_TOOL_DISCLOSURE[id]).toBe('essential');
		}
	});

	it('keeps contextual and administrative actions off the static list', () => {
		const administrativeIds = PROPOSALS_TOOL_IDS.filter(
			(id) => PROPOSALS_TOOL_DISCLOSURE[id] === 'administrative',
		);
		const contextualIds = PROPOSALS_TOOL_IDS.filter(
			(id) => PROPOSALS_TOOL_DISCLOSURE[id] === 'contextual',
		);
		expect(administrativeIds.length).toBeGreaterThan(0);
		expect(contextualIds.length).toBeGreaterThan(0);
		for (const id of [...administrativeIds, ...contextualIds]) {
			expect(PROPOSALS_ESSENTIAL_TOOL_IDS).not.toContain(id);
		}
	});
});

describe('proposals disclosure — real wire measurement (q00016 S8)', () => {
	it('exposes only the essential ids in a real native tools/list, below the 20 KB ceiling', async () => {
		// Disclosure is opt-in: `native` without it lists everything, which
		// is the mode's documented promise and what every other e2e spec
		// here relies on. This spec is the one that wants it on.
		const harness = await createAssembledProposalsServer({
			progressiveDisclosure: true,
		});
		try {
			const { tools } = await harness.client.listTools();
			const proposalsTools = tools.filter((tool) =>
				tool.name.startsWith('delendai_proposals_'),
			);

			// The wiring in plugins/proposals/src/index.ts must have hidden
			// every contextual/administrative tool from this real,
			// protocol-level tools/list — not just the pure policy map.
			const exposedIds = proposalsTools
				.map((tool) => tool.name.replace('delendai_proposals_', ''))
				.sort();
			expect(exposedIds).toEqual(
				[...PROPOSALS_ESSENTIAL_TOOL_IDS].sort(),
			);

			// Reuse the repo's one shared wire-byte counter (also used by
			// ToolSurfaceRuntime.measureSchemaBytes and the token-budget
			// dashboard) instead of a second hand-rolled measurement.
			const measured = measureBootstrapBytes(proposalsTools);

			// Before progressive disclosure: 50,896 B across all 34 tools (measured by
			// bun tools/scripts/report/token-budget-dashboard.script.ts,
			// pinned in docs/delendai/TOKEN-BUDGETS.md's plugin-marginal
			// dashboard, "proposals" row, swarm/full/vertex presets).
			expect(measured.bytes).toBeGreaterThan(0);
			expect(measured.bytes).toBeLessThanOrEqual(20_000);
		} finally {
			await harness.close();
		}
	});

	it('a hidden (contextual/administrative) proposals tool is still callable through the router', async () => {
		// Disclosure is opt-in: `native` without it lists everything, which
		// is the mode's documented promise and what every other e2e spec
		// here relies on. This spec is the one that wants it on.
		const harness = await createAssembledProposalsServer({
			progressiveDisclosure: true,
		});
		try {
			// `state_health` is `administrative` — hidden from tools/list —
			// but must still be a real, invokable tool: the plan's own risk
			// note is explicit that "the tool still exists and is
			// activated; what changes is that it costs no tokens until it
			// is asked for." A hidden AND unreachable tool would be the
			// exact failure this repo's standing rule forbids.
			const { tools } = await harness.client.listTools();
			const listedNames = new Set(tools.map((tool) => tool.name));
			expect(listedNames.has('delendai_proposals_state_health')).toBe(
				false,
			);
			expect(listedNames.has('delendai_vertex')).toBe(true);

			const result = await harness.callTool('delendai_vertex', {
				domain: 'proposals',
				action: 'state_health',
				args: {},
			});
			expect(result.ok).toBe(true);
			expect(result.structured).toMatchObject({
				routed: true,
				tool: 'delendai_proposals_state_health',
				isError: false,
			});
		} finally {
			await harness.close();
		}
	});
});
