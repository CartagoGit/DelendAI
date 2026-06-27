/**
 * render-host-hints.spec.ts — pin the agnostic-bootstrap contract:
 *
 *   1. Every fragment MUST reference the universal bootstrap.
 *   2. No fragment MAY enumerate tool names, skill names, or proposal ids.
 *   3. The 3 fragments MUST differ in the host-specific footnote only,
 *      never in the routing content.
 *   4. The renderer MUST be byte-stable (running it twice produces the
 *      same bytes given the same options).
 */
import { describe, expect, it } from 'vitest';

import {
	BOOTSTRAP_PATH,
	HOST_FRAGMENTS,
	MAX_FRAGMENT_BYTES,
	renderHostHints,
} from './render-host-hints.script.ts';

const ID_PATTERN = /`[a-z][0-9]{4,5}`/g;
const TOOL_NAME_PATTERN = /`mcp-vertex_[a-z_]+`/g;

describe('renderHostHints (agnostic bootstrap)', () => {
	it('emits exactly one fragment per registered host', () => {
		const rendered = renderHostHints();
		expect(rendered.map((f) => f.id).sort()).toEqual(
			['agents', 'claude', 'copilot'].sort(),
		);
		expect(rendered.map((f) => f.filename).sort()).toEqual(
			[
				'agents.generated.md',
				'claude.generated.md',
				'copilot-instructions.generated.md',
			].sort(),
		);
	});

	it('every fragment references the universal bootstrap', () => {
		for (const fragment of renderHostHints()) {
			expect(
				fragment.text,
				`${fragment.id} must reference ${BOOTSTRAP_PATH}`,
			).toContain(BOOTSTRAP_PATH);
		}
	});

	it('no fragment enumerates tool names', () => {
		for (const fragment of renderHostHints()) {
			const tools = fragment.text.match(TOOL_NAME_PATTERN) ?? [];
			// The bootstrap path includes the 3 routing entry points —
			// allowed because they are the routing surface, not a list.
			const nonBootstrapTools = tools.filter(
				(name) =>
					name !== '`mcp-vertex_agent_catalog`' &&
					name !== '`mcp-vertex_overview`' &&
					name !== '`mcp-vertex_proposals_auto_work`',
			);
			expect(
				nonBootstrapTools,
				`${fragment.id} must not enumerate tool names, found: ${nonBootstrapTools.join(', ')}`,
			).toEqual([]);
		}
	});

	it('no fragment enumerates proposal or skill ids', () => {
		for (const fragment of renderHostHints()) {
			const ids = fragment.text.match(ID_PATTERN) ?? [];
			expect(
				ids,
				`${fragment.id} must not enumerate proposal/skill ids, found: ${ids.join(', ')}`,
			).toEqual([]);
		}
	});

	it('fragments stay well below the per-fragment byte budget', () => {
		for (const fragment of renderHostHints()) {
			expect(
				fragment.text.length,
				`${fragment.id} is ${fragment.text.length}B, budget is ${MAX_FRAGMENT_BYTES}B`,
			).toBeLessThan(MAX_FRAGMENT_BYTES);
		}
	});

	it('fragments agree on routing content and only differ in host-specific footnotes', () => {
		const rendered = renderHostHints();
		const copilot = rendered.find((f) => f.id === 'copilot')!.text;
		const claude = rendered.find((f) => f.id === 'claude')!.text;
		const agents = rendered.find((f) => f.id === 'agents')!.text;
		// All three MUST mention the canonical first move in identical wording.
		const canonicalFirstMove =
			'`mcp-vertex_overview { compact: true }` followed by';
		expect(copilot).toContain(canonicalFirstMove);
		expect(claude).toContain(canonicalFirstMove);
		expect(agents).toContain(canonicalFirstMove);
	});

	it('renderer is byte-stable (idempotent)', () => {
		const first = renderHostHints();
		const second = renderHostHints();
		expect(second).toEqual(first);
	});

	it('host-specific footnote points at the right bootstrap section', () => {
		const rendered = renderHostHints();
		const copilot = rendered.find((f) => f.id === 'copilot')!.text;
		const claude = rendered.find((f) => f.id === 'claude')!.text;
		const agents = rendered.find((f) => f.id === 'agents')!.text;
		// Each fragment MUST point at the host-specific appendix in the
		// universal bootstrap, never duplicate the rule body here.
		expect(copilot).toMatch(/appendix 8\.1/i);
		expect(claude).toMatch(/appendix 8\.2/i);
		expect(agents).toMatch(/section 7/i);
	});

	it('HOST_FRAGMENTS and renderHostHints agree', () => {
		const ids = HOST_FRAGMENTS.map((f) => f.id).sort();
		expect(ids).toEqual(['agents', 'claude', 'copilot']);
	});
});
