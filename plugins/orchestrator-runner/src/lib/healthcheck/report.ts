/**
 * report.ts — build a per-provider health row (pure).
 *
 * Given a provider and (for CLI-reachable kinds) its probe result, produce
 * the `IProviderHealthReport` row `<prefix>_healthcheck_providers` returns
 * and the matching `IProviderAvailability` the runner mirrors in memory.
 *
 * SCOPE NOTE (S4, headless brain): real auth-status and model-availability
 * RPCs per vendor land in S5 (bootstrap/quota). Here `auth`/`model.available`
 * are best-effort: a not-installed CLI is `unauthenticated`/unavailable; an
 * installed one is optimistically `available` with unknown (`null`) auth
 * until S5 refines it. The shape is complete so downstream code (and the
 * in-memory mirror) is stable across slices.
 */
import type {
	IProviderAvailability,
	IProviderCapabilities,
	ProviderState,
} from '@mcp-vertex/core/public';

import type { ICliProbeResult, IProviderHealthReport } from '../types';
import { installHintFor } from './install-hints';

/** The CLI command a provider invokes, or `null` for api/subscription. */
export const commandOf = (provider: IProviderCapabilities): string | null => {
	switch (provider.invoke.kind) {
		case 'cli':
			return provider.invoke.command;
		case 'mcp-server':
			return provider.invoke.server;
		default:
			return null;
	}
};

/**
 * Build the health report row for one provider. `probe` is required for
 * providers with a CLI command (kind `cli`/`mcp-server`) and ignored
 * otherwise.
 */
export const buildProviderHealth = (
	provider: IProviderCapabilities,
	probe: ICliProbeResult | null,
): IProviderHealthReport => {
	const command = commandOf(provider);

	// api / subscription: no CLI to install; reachability is auth/env, which
	// S5 verifies. Treat the "cli" facet as present so `overall` reflects
	// only what S4 can actually observe.
	if (command === null) {
		return {
			id: provider.id,
			cli: { installed: true, path: null, version: null },
			auth: { authenticated: null, tier: null },
			model: { requested: provider.modelId, available: null },
			overall: 'available',
		};
	}

	const installed = probe?.installed ?? false;
	const overall: ProviderState = installed ? 'available' : 'not-installed';

	const base: IProviderHealthReport = {
		id: provider.id,
		cli: {
			installed,
			path: probe?.path ?? null,
			version: probe?.version ?? null,
		},
		auth: { authenticated: installed ? null : false, tier: null },
		model: {
			requested: provider.modelId,
			available: installed,
		},
		overall,
	};

	if (!installed) {
		return { ...base, installHint: installHintFor(command) };
	}
	return base;
};

/** Project a health row to the `IProviderAvailability` mirror shape. */
export const availabilityFromHealth = (
	report: IProviderHealthReport,
): IProviderAvailability => ({
	id: report.id,
	state: report.overall,
	...(report.overall === 'not-installed'
		? { reason: 'CLI not found on PATH' }
		: {}),
});
