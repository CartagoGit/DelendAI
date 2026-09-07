/**
 * Generic test suite for the CapabilityResolver.
 *
 * x00512 / S6. These tests use a synthetic plugin catalog — no real
 * plugin identifier is hardcoded. The fixtures live under
 * `tests/src/lib/dispatch/_fixtures/`. Anything that names an
 * existing plugin, tool, or skill from the runtime must NOT appear in
 * these tests: that would couple the resolver's contract to a
 * specific domain.
 *
 * Each test exercises one of the resolvers's six terminal reasons or
 * one of the success shapes. The suite is intentionally small but
 * covers every branch the resolver exposes publicly.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	resolveAndInvoke,
	type IResolverError,
} from '../../../../src/lib/dispatch/capability-resolver';
import {
	buildFakeRuntime,
	type FakeRuntimeAccess,
} from './_fixtures/fake-runtime';

describe('CapabilityResolver (x00512 / S1 + S6)', () => {
	let access: FakeRuntimeAccess;

	beforeEach(() => {
		access = buildFakeRuntime();
	});

	afterEach(() => {
		access.dispose();
	});

	it('returns ok for a capability known by qualified name', async () => {
		const result = await resolveAndInvoke(
			access.port,
			{ qualifiedName: 'fake_alpha_list', args: { limit: 4 } },
			access.extra,
		);
		expect(result.status).toBe('ok');
		if (result.status !== 'ok') return;
		expect(result.toolName).toBe('fake_alpha_list');
		expect(result.access).toBe<typeof result.access>('hidden');
		expect(result.pluginId).toBe('fake_alpha');
	});

	it('returns ok for a capability known by domain + action', async () => {
		const result = await resolveAndInvoke(
			access.port,
			{ domain: 'alpha', action: 'list' },
			access.extra,
		);
		expect(result.status).toBe('ok');
		if (result.status !== 'ok') return;
		expect(result.toolName).toBe('fake_alpha_list');
		expect(result.domain).toBe('alpha');
		expect(result.action).toBe('list');
	});

	it('consults the catalog for the qualified name when neither input alone resolves', async () => {
		// The "qualifiedName" in this case is a routing form. The
		// resolver must fall through to the (domain, action) lookup.
		const result = await resolveAndInvoke(
			access.port,
			{
				qualifiedName: 'unmatched_synthetic_qualified',
				domain: 'beta',
				action: 'fetch',
			},
			access.extra,
		);
		expect(result.status).toBe('ok');
		if (result.status !== 'ok') return;
		expect(result.toolName).toBe('fake_beta_fetch');
	});

	it('returns catalog_missing when neither lookup succeeds', async () => {
		const result = await resolveAndInvoke(
			access.port,
			{ domain: 'unknown', action: 'noop' },
			access.extra,
		);
		expect(result.status).toBe('terminal');
		if (result.status !== 'terminal') return;
		expect(result.reason).toBe('catalog_missing');
		expect(
			requestMatches(result, { domain: 'unknown', action: 'noop' }),
		).toBe(true);
		// Lazy-load recovery language must NOT leak into the error.
		expect(result.detail.toLowerCase()).not.toContain('disabled');
		expect(result.detail.toLowerCase()).not.toContain('not loaded');
		expect(result.detail.toLowerCase()).not.toContain('not available');
	});

	it('converts an administratively deactivated access into policy_denied', async () => {
		access.deactivatePlugin('fake_alpha');
		const result = await resolveAndInvoke(
			access.port,
			{ qualifiedName: 'fake_alpha_list' },
			access.extra,
		);
		expect(result.status).toBe('terminal');
		if (result.status !== 'terminal') return;
		expect(result.reason).toBe('policy_denied');
		expect(result.capability).toBe('fake_alpha_list');
	});

	it('returns activation_failed when the async activation throws', async () => {
		access.makeLoaderThrow('fake_beta', 'synthetic loader failure');
		const result = await resolveAndInvoke(
			access.port,
			{ domain: 'beta', action: 'fetch' },
			access.extra,
		);
		expect(result.status).toBe('terminal');
		if (result.status !== 'terminal') return;
		expect(result.reason).toBe('activation_failed');
		expect(result.detail).toContain('synthetic loader failure');
	});

	it('shares exactly one loader invocation across concurrent activations of the same plugin', async () => {
		const loader = access.trackLoaderInvocations();
		const concurrency = 8;
		const requests = await Promise.all(
			Array.from({ length: concurrency }, () =>
				resolveAndInvoke(
					access.port,
					{ domain: 'alpha', action: 'list' },
					access.extra,
				),
			),
		);
		expect(requests.every((r) => r.status === 'ok')).toBe(true);
		expect(loader.callCount('fake_alpha')).toBe(1);
	});

	it('does not call the loader when the plugin is already active', async () => {
		access.activateSync('fake_alpha');
		const loader = access.trackLoaderInvocations();
		await resolveAndInvoke(
			access.port,
			{ domain: 'alpha', action: 'list' },
			access.extra,
		);
		expect(loader.callCount('fake_alpha')).toBe(0);
	});

	it('returns argument_validation_failed when both identifiers are absent', async () => {
		const result = await resolveAndInvoke(
			access.port,
			{ args: { anything: 1 } },
			access.extra,
		);
		expect(result.status).toBe('terminal');
		if (result.status !== 'terminal') return;
		expect(result.reason).toBe('argument_validation_failed');
	});

	it('returns execution_failed when the handler throws', async () => {
		access.makeHandlerThrow('fake_alpha_list', 'synthetic handler failure');
		const result = await resolveAndInvoke(
			access.port,
			{ domain: 'alpha', action: 'list' },
			access.extra,
		);
		expect(result.status).toBe('terminal');
		if (result.status !== 'terminal') return;
		expect(result.reason).toBe('execution_failed');
		expect(result.detail).toContain('synthetic handler failure');
	});

	it('does not fall back to filesystem or process on any terminal outcome', async () => {
		// The fake runtime exposes a counter for "filesystem-like"
		// write operations. Every terminal path must keep it at zero.
		const counter = access.trackFilesystemWrites();
		const requests = [
			resolveAndInvoke(
				access.port,
				{ domain: 'nope', action: 'nada' },
				access.extra,
			),
			resolveAndInvoke(
				access.port,
				{ qualifiedName: 'fake_alpha_list' },
				access.extra,
			),
		];
		await Promise.all(requests);
		expect(counter.count()).toBe(0);
	});
});

const requestMatches = (
	error: IResolverError,
	expected: Readonly<Record<string, unknown>>,
): boolean => {
	for (const [k, v] of Object.entries(expected)) {
		if (error.request[k] !== v) return false;
	}
	return true;
};
