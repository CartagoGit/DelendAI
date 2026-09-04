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
} from '@delendai/core/public';

import {
	buildActivateContext,
	runLifecycle,
	type IPhasedLifecycle,
} from '../../../../src/lib/plugins/lifecycle';

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

	// --- f00188: the warning is emitted at boot (phased activation) ---

	const captureLogger = () => {
		const warnings: string[] = [];
		return {
			logger: {
				log: () => {},
				warn: (message: string) => warnings.push(message),
				error: () => {},
			},
			warnings,
		};
	};

	const noopLifecycle: IPhasedLifecycle = {
		prepare: async () => ({}),
		activate: async () => ({}),
		dispose: async () => {},
	};

	it('runLifecycle warns at boot when the plugin declares no capabilities', async () => {
		const { logger, warnings } = captureLogger();
		await runLifecycle(
			noopLifecycle,
			{ name: 'legacy-plugin', manifest: {}, configResolved: {}, logger },
			{
				name: 'legacy-plugin',
				manifest: {},
				configResolved: {},
				logger,
				capabilities: {},
			},
		);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('legacy-plugin');
		expect(warnings[0]).toContain('lint:capabilities');
	});

	it('runLifecycle does NOT warn when the plugin declares capabilities', async () => {
		const { logger, warnings } = captureLogger();
		const manifest = { capabilities: ['fs:read'] };
		await runLifecycle(
			noopLifecycle,
			{ name: 'declared-plugin', manifest, configResolved: {}, logger },
			{
				name: 'declared-plugin',
				manifest,
				configResolved: {},
				logger,
				capabilities: {},
			},
		);
		expect(warnings).toHaveLength(0);
	});

	it('buildActivateContext wires the enforcement Proxy for the declared subset', () => {
		const prepareCtx = {
			name: 'p',
			manifest: { capabilities: ['fs:read'] },
			configResolved: {},
			logger: console,
		};
		const ctx = buildActivateContext(prepareCtx, ['fs:read'] as const, {
			fs: { read: () => 'ok' },
		});
		// Declared → resolves through the Proxy.
		expect(ctx.capabilities.fs.read('x')).toBe('ok');
		// Undeclared → runtime refusal (bypassing the type system).
		const git = (
			ctx.capabilities as unknown as {
				git: { write: (args: unknown) => unknown };
			}
		).git.write;
		expect(git({})).toMatchObject({
			kind: 'capability-denied',
			capability: 'git:write',
		});
	});

	it('buildActivateContext with no declared capabilities is empty and refusing', () => {
		const ctx = buildActivateContext(
			{ name: 'p', manifest: {}, configResolved: {}, logger: console },
			[] as const,
			{},
		);
		const read = (
			ctx.capabilities as unknown as {
				fs: { read: (args: unknown) => unknown };
			}
		).fs.read;
		expect(read('/tmp')).toMatchObject({
			kind: 'capability-denied',
			capability: 'fs:read',
		});
	});
});
