/**
 * identity-renames.spec.ts — b00239 S4.
 *
 * Pins the canonical legacy → new rename table used by every
 * format-specific migrator. The migrator specs depend on the
 * behaviour pinned here, but never re-test it; this is the single
 * place where a regression in the table is caught.
 *
 * Coverage:
 *  - Every spelling in `IDENTITY_RENAMES` round-trips to its
 *    expected target.
 *  - `@mcp-vertex/core` rewrites atomically as `@delendai/core`
 *    (longest-prefix-first ordering).
 *  - `MCP Vertex` and `MCP-VERTEX` rewrite to their PascalCase /
 *    UPPERCASE targets before any lowercase match could
 *    half-convert them.
 *  - Strings without legacy identity pass through unchanged.
 */
import { describe, expect, it } from 'vitest';

import {
	IDENTITY_RENAMES,
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from '@delendai/core/lib/workspace-migration/migrators/identity-renames';

describe('IDENTITY_RENAMES', () => {
	it('orders @mcp-vertex before mcp-vertex so the scope rewrites atomically', () => {
		const orderedFrom = IDENTITY_RENAMES.map((entry) => entry.from);
		const scopeIndex = orderedFrom.indexOf('@mcp-vertex');
		const bareIndex = orderedFrom.indexOf('mcp-vertex');
		expect(scopeIndex).toBeGreaterThanOrEqual(0);
		expect(bareIndex).toBeGreaterThanOrEqual(0);
		expect(scopeIndex).toBeLessThan(bareIndex);
	});

	it('orders PascalCase and UPPERCASE before the lowercase variants', () => {
		const orderedFrom = IDENTITY_RENAMES.map((entry) => entry.from);
		const pascal = orderedFrom.indexOf('MCP Vertex');
		const screaming = orderedFrom.indexOf('MCP-VERTEX');
		const lower = orderedFrom.indexOf('mcp-vertex');
		expect(pascal).toBeLessThan(lower);
		expect(screaming).toBeLessThan(lower);
	});

	it('maps every entry to its declared target', () => {
		expect(IDENTITY_RENAMES).toEqual([
			{ from: '@mcp-vertex', to: '@delendai' },
			{ from: 'MCP-VERTEX', to: 'DELENDAI' },
			{ from: 'MCP_VERTEX', to: 'DELENDAI' },
			{ from: 'MCP Vertex', to: 'DelendAI' },
			{ from: 'mcp_vertex', to: 'delendai' },
			{ from: 'mcpvertex', to: 'delendai' },
			{ from: 'mcp-vertex', to: 'delendai' },
			{ from: 'mcpv', to: 'delendai' },
		]);
	});
});

describe('rewriteIdentityInString', () => {
	it('rewrites the lowercase scope atomically', () => {
		expect(rewriteIdentityInString('@mcp-vertex/core')).toBe(
			'@delendai/core',
		);
		expect(rewriteIdentityInString('@mcp-vertex/cli')).toBe(
			'@delendai/cli',
		);
	});

	it('does NOT half-convert @mcp-vertex to @delendai-something', () => {
		// Without the longest-prefix-first ordering, a naive
		// alternation would turn @mcp-vertex into @delendai-vertex.
		// This test pins the behaviour that prevents it.
		const after = rewriteIdentityInString('@mcp-vertex/core');
		expect(after).not.toContain('mcp-vertex');
		expect(after).not.toContain('delendai-vertex');
		expect(after).toBe('@delendai/core');
	});

	it('rewrites PascalCase to PascalCase and UPPERCASE to UPPERCASE', () => {
		expect(rewriteIdentityInString('MCP Vertex for VS Code')).toBe(
			'DelendAI for VS Code',
		);
		expect(rewriteIdentityInString('MCP-VERTEX_HOME')).toBe(
			'DELENDAI_HOME',
		);
	});

	it('rewrites bare tokens and snake_case tokens', () => {
		expect(rewriteIdentityInString('mcp-vertex')).toBe('delendai');
		expect(rewriteIdentityInString('mcp_vertex_helper')).toBe(
			'delendai_helper',
		);
	});

	it('passes strings without legacy identity unchanged', () => {
		expect(rewriteIdentityInString('hello world')).toBe('hello world');
		expect(rewriteIdentityInString('@delendai/core')).toBe(
			'@delendai/core',
		);
		expect(rewriteIdentityInString('mcp')).toBe('mcp');
	});

	it('is pure: same input, same output, no shared state', () => {
		const input = '@mcp-vertex/core';
		const first = rewriteIdentityInString(input);
		const second = rewriteIdentityInString(input);
		expect(first).toBe(second);
	});
});

describe('stringHasLegacyIdentity', () => {
	it('returns true when any legacy token is present', () => {
		expect(stringHasLegacyIdentity('@mcp-vertex/core')).toBe(true);
		expect(stringHasLegacyIdentity('MCP Vertex for VS Code')).toBe(true);
		expect(stringHasLegacyIdentity('MCP-VERTEX_HOME')).toBe(true);
		expect(stringHasLegacyIdentity('mcp_vertex_helper')).toBe(true);
	});

	it('returns false when no legacy token is present', () => {
		expect(stringHasLegacyIdentity('@delendai/core')).toBe(false);
		expect(stringHasLegacyIdentity('hello world')).toBe(false);
		expect(stringHasLegacyIdentity('delendai')).toBe(false);
	});
});
