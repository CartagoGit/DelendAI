/**
 * provider-status.builder.ts — f00098 S1.
 *
 * Pure payload→render-model mapper for the provider-status dashboard.
 * Maps raw `healthcheck_providers` + `get_quota` tool payloads
 * (orchestrator-runner plugin) into `IProviderStatusModel`. No host API
 * imports, no I/O, never throws: when the plugin is absent (payload
 * `undefined`/`null`) it returns an explicit 'plugin not loaded — opt-in'
 * model with the exact config snippet, per the f00098 non-goal ("every
 * view must render a helpful opt-in hint … never an error state").
 */
import type {
	IGetQuotaPayload,
	IHealthcheckProvidersPayload,
	IProviderHealthRowPayload,
	IProviderQuotaMeter,
	IProviderStatusModel,
	IProviderStatusRow,
	IQuotaWindowPayload,
} from '../../contracts/interfaces/provider-status.interface';

/** Exact opt-in snippet (both plugins: the runner hard-depends on usage-tracking). */
export const ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET =
	'mcp-vertex --plugins=usage-tracking,orchestrator-runner';

const num = (v: unknown): number =>
	typeof v === 'number' && Number.isFinite(v) ? v : 0;

const toQuotaMeter = (window: IQuotaWindowPayload): IProviderQuotaMeter => {
	const usedPct =
		window.limit !== null && window.limit > 0 && window.used !== null
			? Math.round((window.used / window.limit) * 100)
			: null;
	return {
		window: window.window,
		limit: window.limit,
		used: window.used,
		resetAt: window.resetAt,
		usedPct,
	};
};

const toRow = (
	health: IProviderHealthRowPayload,
	quotaWindows: readonly IQuotaWindowPayload[],
): IProviderStatusRow => ({
	id: health.id,
	state: health.overall,
	// Same one-line projection as core's `IProviderSummary.reachable`.
	reachable: health.overall === 'available',
	modelId: health.model?.requested ?? '',
	modelAvailable: health.model?.available ?? null,
	cliInstalled: health.cli?.installed ?? false,
	cliVersion: health.cli?.version ?? null,
	authenticated: health.auth?.authenticated ?? null,
	authTier: health.auth?.tier ?? null,
	installHint: health.installHint
		? {
				command: [
					health.installHint.tool,
					...(health.installHint.args ?? []),
				]
					.join(' ')
					.concat(health.installHint.pipeTo === 'sh' ? ' | sh' : ''),
				dangerous: health.installHint.dangerous === true,
				caveat: health.installHint.caveat ?? '',
			}
		: null,
	quota: quotaWindows.map(toQuotaMeter),
});

/**
 * Build the provider-status render-model from the raw tool payloads.
 *
 * @param healthcheck `healthcheck_providers` structured output, or
 *   `null`/`undefined` when orchestrator-runner is not loaded.
 * @param quota `get_quota` structured output; optional — a missing or
 *   `{present:false}` snapshot degrades to rows without quota meters.
 */
export function buildProviderStatusModel(
	healthcheck: IHealthcheckProvidersPayload | null | undefined,
	quota?: IGetQuotaPayload | null,
): IProviderStatusModel {
	if (healthcheck === null || healthcheck === undefined) {
		return {
			kind: 'plugin-absent',
			plugin: 'orchestrator-runner',
			hint: 'The orchestrator-runner plugin is not loaded. It is opt-in (not in any preset): start the server with it enabled to see provider health and quota.',
			configSnippet: ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET,
		};
	}

	const providers = Array.isArray(healthcheck.providers)
		? healthcheck.providers
		: [];
	const quotaByProvider =
		quota?.present === true && quota.providers
			? quota.providers
			: ({} as Readonly<Record<string, readonly IQuotaWindowPayload[]>>);

	const rows = providers.map((health) =>
		toRow(health, quotaByProvider[health.id] ?? []),
	);

	return {
		kind: 'ready',
		checkedAt: healthcheck.checkedAt ?? '',
		summary: {
			total: num(healthcheck.summary?.total),
			available: num(healthcheck.summary?.available),
			unavailable: num(healthcheck.summary?.unavailable),
		},
		emptyRoster: rows.length === 0,
		rows,
		quota: {
			present: quota?.present === true,
			updatedAt: quota?.updatedAt ?? null,
			note: quota?.note ?? null,
		},
	};
}
