/**
 * render-host-hints.spec.ts — pin the agnostic-bootstrap contract:
 *
 *   1. The fragment MUST reference the universal bootstrap.
 *   2. The fragment MUST NOT enumerate tool names, skill names, or
 *      proposal ids.
 *   3. f00092: there is exactly one fragment; the renderer is the
 *      single source of truth for `agent-instructions.generated.md`.
 *   4. The renderer MUST be byte-stable (running it twice produces the
 *      same bytes given the same options).
 */
import { describe, expect, it } from 'vitest';

import {
	BOOTSTRAP_PATH,
	HOST_INSTRUCTIONS_FILENAME,
	HOST_INSTRUCTIONS_ID,
	MAX_FRAGMENT_BYTES,
	renderHostHints,
} from './render-host-hints.script.ts';

const ID_PATTERN = /`[a-z][0-9]{4,5}`/g;
const TOOL_NAME_PATTERN = /`mcp-vertex_[a-z_]+`/g;

describe('renderHostHints (agnostic bootstrap, f00092 single fragment)', () => {
	it('emits exactly one canonical fragment', () => {
		const rendered = renderHostHints();
		expect(rendered).toHaveLength(1);
		expect(rendered[0]?.id).toBe(HOST_INSTRUCTIONS_ID);
		expect(rendered[0]?.filename).toBe(HOST_INSTRUCTIONS_FILENAME);
	});

	it('the canonical fragment id and filename are exported constants', () => {
		expect(HOST_INSTRUCTIONS_ID).toBe('agent-instructions');
		expect(HOST_INSTRUCTIONS_FILENAME).toBe(
			'agent-instructions.generated.md',
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
			// The bootstrap path includes "mcp-vertex_agent_catalog" — that one
			// is allowed because it is the routing entry point, not a list.
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

	it('fragment carries the canonical first move', () => {
		const rendered = renderHostHints();
		const text = rendered[0]?.text ?? '';
		const canonicalFirstMove =
			'`mcp-vertex_overview { compact: true }` followed by';
		expect(text).toContain(canonicalFirstMove);
	});

	it('f00092: fragment does NOT carry any host-specific footnote (those live in the hand-edited host files now)', () => {
		const text = renderHostHints()[0]?.text ?? '';
		// The 1-line footnote used to live here; it MUST be gone so
		// the single fragment is host-agnostic by construction.
		expect(text).not.toMatch(/appendix 8\./i);
		expect(text).not.toMatch(/section 7/i);
		expect(text).not.toMatch(/Host-specific footnote/i);
	});

	it('renderer is byte-stable (idempotent)', () => {
		const first = renderHostHints();
		const second = renderHostHints();
		expect(second).toEqual(first);
	});
});
