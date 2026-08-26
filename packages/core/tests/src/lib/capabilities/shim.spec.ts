/**
 * shim.spec.ts — f00188 (Track F / security).
 *
 * The capability pipeline must accept plugins that ship WITHOUT an
 * explicit `capabilities` field (legacy / first wave of migration).
 * The shim grants every capability with a single boot-time warning
 * so the host still loads the plugin — the lint escalates to an
 * error after the migration window closes.
 */

import { describe, expect, it } from 'vitest';

import {
	CAPABILITIES,
	parseDeclaredCapabilities,
	summariseLegacyShimWarning,
} from '@mcp-vertex/core/public';

describe('f00188 — capability legacy shim (Track F)', () => {
	it('parses an absent capabilities field as [] (legacy signal)', () => {
		expect(parseDeclaredCapabilities(undefined)).toEqual([]);
		expect(parseDeclaredCapabilities(null)).toEqual([]);
		expect(parseDeclaredCapabilities({})).toEqual([]);
	});

	it('parses an explicit empty array as [] (not an unknown capability)', () => {
		expect(parseDeclaredCapabilities({ capabilities: [] })).toEqual([]);
	});

	it('rejects a manifest whose declared capability is unknown', () => {
		expect(() =>
			parseDeclaredCapabilities({ capabilities: ['git:teleport'] }),
		).toThrow(/unknown capability/);
	});

	it('parses a fully-declared manifest into the typed union', () => {
		const parsed = parseDeclaredCapabilities({
			capabilities: ['git:read', 'fs:write'],
		});
		expect([...parsed]).toEqual(['git:read', 'fs:write']);
	});

	it('shim warning names the plugin and references the full granted set', () => {
		const warning = summariseLegacyShimWarning('legacy-plugin');
		expect(warning.pluginName).toBe('legacy-plugin');
		expect(warning.granted).toEqual(CAPABILITIES);
		expect(warning.message).toContain('legacy-plugin');
		expect(warning.message).toContain('lint:capabilities');
	});

	it('shim warning is deterministic: same input ⇒ same message', () => {
		expect(summariseLegacyShimWarning('p').message).toBe(
			summariseLegacyShimWarning('p').message,
		);
		expect(summariseLegacyShimWarning('p').message).not.toBe(
			summariseLegacyShimWarning('q').message,
		);
	});
});
