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
} from '@delendai/core/public';
import type { IClientVerdict } from '@delendai/core/contracts';

import type { IProviderChecks } from '../contracts/interfaces/provider-checks.interface';
import type { ICliProbeResult, IProviderHealthReport } from '../types';
import { installHintFor } from './install-hints';

/** The CLI command a provider invokes, or `null` for api/subscription. */
export const commandOf = (provider: IProviderCapabilities): string | null => {
	switch (provider.invoke.kind) {
		case 'cli':
			return provider.invoke.command;
		case 'mcp-server':
			return provider.invoke.server;
		case 'acp':
			return provider.invoke.command ?? provider.invoke.agent ?? null;
		default:
			return null;
	}
};

/** Whether `modelId` is among `listed`, bare or as `<provider>/<id>`. */
export const listsModel = (
	listed: readonly string[],
	modelId: string,
): boolean =>
	listed.some(
		(each) =>
			each === modelId ||
			each.endsWith(`/${modelId}`) ||
			modelId.endsWith(`/${each}`),
	);

/** The state a client's verdict puts a provider in; `undefined` when it does not decide one. */
const stateOfVerdict = (
	verdict: IClientVerdict | undefined,
): ProviderState | undefined => {
	switch (verdict) {
		case 'needs-login':
		case 'needs-plan':
			return 'unauthenticated';
		case 'quota-exhausted':
			return 'quota-exceeded';
		default:
			return undefined;
	}
};

/**
 * Build the health report row for one provider. `probe` is required for
 * providers with a CLI command (kind `cli`/`mcp-server`) and ignored
 * otherwise. An installed CLI is `available` only once what it was asked
 * agrees: its login, when it can be asked, and the model, when it lists
 * them. Installed alone read as ready to work.
 */
export const buildProviderHealth = (
	provider: IProviderCapabilities,
	probe: ICliProbeResult | null,
	checks: IProviderChecks = {},
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
	const refused = installed ? stateOfVerdict(checks.verdict) : undefined;
	const modelListed =
		checks.models === undefined
			? null
			: listsModel(checks.models, provider.modelId);
	const overall: ProviderState = !installed
		? 'not-installed'
		: (refused ??
			(modelListed === false ? 'model-unavailable' : 'available'));

	const base: IProviderHealthReport = {
		id: provider.id,
		cli: {
			installed,
			path: probe?.path ?? null,
			version: probe?.version ?? null,
		},
		auth: {
			authenticated: !installed
				? false
				: checks.verdict === 'usable'
					? true
					: refused !== undefined
						? false
						: null,
			tier: checks.authTier ?? null,
		},
		model: {
			requested: provider.modelId,
			available: installed ? (modelListed ?? null) : false,
		},
		overall,
	};

	if (!installed) {
		return { ...base, installHint: installHintFor(command) };
	}
	return base;
};

/** Why a provider is not available, as the router's mirror says it. */
const REASON_OF_STATE: Partial<Record<ProviderState, string>> = {
	'not-installed': 'CLI not found on PATH',
	unauthenticated: 'the client says it is not logged in or has no plan',
	'quota-exceeded': 'the client says its quota is spent',
	'model-unavailable': 'the client does not list this model',
};

/** Project a health row to the `IProviderAvailability` mirror shape. */
export const availabilityFromHealth = (
	report: IProviderHealthReport,
): IProviderAvailability => ({
	id: report.id,
	state: report.overall,
	...(REASON_OF_STATE[report.overall] === undefined
		? {}
		: { reason: REASON_OF_STATE[report.overall] }),
});
