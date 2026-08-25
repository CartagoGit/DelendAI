/**
 * llm-rationale.ts — f00142 S3: opt-in LLM rationale for the
 * `plugins_recommend` tool.
 *
 * The pure plugin-fit scorer is fully functional on its own. When the
 * caller passes `refine: true` AND an LLM provider is reachable
 * (discovered via `auto-agent-selector`), this module produces a
 * structured handoff decision the host can render as a copy-paste
 * command or invoke directly via `orchestrator-runner`.
 *
 * Graceful degradation: when no provider is reachable, the module
 * returns `{ reachable: false, ... }` so the host can show "LLM
 * refinement skipped — install a provider or set an API key" without
 * failing the recommendation. The pure scorer always wins.
 *
 * Pure over the injected roster: same inputs -> same output.
 */
import {
	rankProviders,
	type IRankInput,
	type IRankedProvider,
	type IProviderCandidate,
} from '@mcp-vertex/auto-agent-selector/public';

import type {
	IPluginFit,
	IProjectSignals,
} from '../contracts/interfaces/plugin-fit.interface';

/**
 * The on-the-wire payload a caller can act on. The host decides how
 * to invoke the provider — `format_handoff` (recommended) or
 * `invoke` directly via `orchestrator-runner`.
 */
export interface ILlmRationaleDecision {
	/** False when no provider is reachable; in that case the other fields are undefined. */
	readonly reachable: boolean;
	/** Stable id of the cheapest-capable provider, when reachable. */
	readonly providerId?: string;
	/** Vendor family (e.g. `anthropic`, `openai`). */
	readonly vendor?: string;
	/** Cost tier (1 cheapest → 5 most expensive). */
	readonly costTier?: 1 | 2 | 3 | 4 | 5;
	/** Plain-language reason the provider was selected. */
	readonly rationale?: string;
	/**
	 * The composed prompt the host should hand to the provider. It is a
	 * deterministic serialisation of the project signals + the
	 * pure-scorer output, so the same input always yields the same
	 * prompt (and therefore reproducible LLM outputs).
	 */
	readonly prompt?: string;
}

const DEFAULT_DIAL = 7;

export interface IBuildLlmRationaleOptions {
	/** Cost↔quality dial 1 (cheapest) … 5 (quality). Defaults to 3. */
	readonly costQualityTradeoff?: number;
	/** Pinned provider id, if the user has a preferred one. */
	readonly pinnedId?: string;
}

/**
 * Build the LLM rationale decision. The caller injects the
 * pre-discovered roster (typically from `discoverRoster` in
 * `auto-agent-selector`); this module only ranks + formats.
 */
export const buildLlmRationale = (
	signals: IProjectSignals,
	fits: readonly IPluginFit[],
	available: readonly IProviderCandidate[],
	options: IBuildLlmRationaleOptions = {},
): ILlmRationaleDecision => {
	if (available.length === 0) {
		return { reachable: false };
	}

	const rankInput: IRankInput = {
		available,
		costQualityTradeoff: options.costQualityTradeoff ?? DEFAULT_DIAL,
		...(options.pinnedId !== undefined
			? { pinnedId: options.pinnedId }
			: {}),
	};

	const ranked: readonly IRankedProvider[] = rankProviders(rankInput);
	const chosen = ranked[0];
	if (chosen === undefined) {
		return { reachable: false };
	}

	return {
		reachable: true,
		providerId: chosen.candidate.id,
		vendor: chosen.candidate.vendor,
		costTier: chosen.candidate.costTier,
		rationale: chosen.rationale,
		prompt: formatPrompt(signals, fits),
	};
};

const formatPrompt = (
	signals: IProjectSignals,
	fits: readonly IPluginFit[],
): string => {
	const lines: string[] = [
		'You are a plugin-fit assistant for a developer tool (mcp-vertex).',
		'Given the project signals + the deterministic plugin-fit ranking below,',
		'produce a one-paragraph rationale per top-5 plugin: why it fits OR',
		'why it does not. Be terse, evidence-based, no marketing.',
		'',
		'Project signals:',
		`  pack: ${signals.pack}`,
		`  languages: ${signals.languages.join(', ') || '(none)'}`,
		`  hasDocsSite: ${signals.hasDocsSite ?? 'unknown'}`,
		`  isCliTool: ${signals.isCliTool ?? 'unknown'}`,
		`  hasBackend: ${signals.hasBackend ?? 'unknown'}`,
		`  hasTests: ${signals.hasTests ?? 'unknown'}`,
		`  taskHint: ${signals.taskHint ?? '(none)'}`,
		'',
		'Plugin-fit ranking (top to bottom):',
	];
	const top = fits.slice(0, 5);
	for (const [i, fit] of top.entries()) {
		lines.push(
			`  ${i + 1}. ${fit.plugin.id} (score=${fit.fitScore.toFixed(2)}) — ` +
				`reasons: ${fit.reasons.join('; ') || '(none)'}`,
		);
	}
	if (top.length === 0) {
		lines.push(
			'  (no positive-fit plugins; recommend de-installing everything)',
		);
	}
	return lines.join('\n');
};
