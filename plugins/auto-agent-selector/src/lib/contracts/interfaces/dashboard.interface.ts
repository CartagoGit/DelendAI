/**
 * dashboard.interface.ts — contracts for the router cost + recommendation
 * dashboard (f00140 S1).
 *
 * SRP: this file only names shapes. The pure view-model builder that turns
 * `(roster, recommendations, spend)` into a renderable row list lives in
 * `../dashboard/view-model.ts`. The CLI command (S2) and the VS Code
 * extension panel (S3) both consume this view-model so they render the same
 * rows.
 */

import type { IProviderCandidate } from './roster.interface';
import type { IRankedProvider } from './ranking.interface';

/** What the user spent on one provider within the tracked window. */
export interface IProviderSpend {
	/** Stable provider id (matches `IProviderCandidate.id`). */
	readonly providerId: string;
	/** Total cost in USD attributed to this provider (window-wide). */
	readonly costUsd: number;
	/** Number of invocations in the window for this provider. */
	readonly calls: number;
}

/** The aggregated spend picture the dashboard consumes. */
export interface ISpendSummary {
	/** Per-provider spend rows. Providers absent from the roster appear here
	 * too — the dashboard surfaces "the router did not pick this but it ran". */
	readonly providers: readonly IProviderSpend[];
	/** Window the summary covers (ISO date or human label — informational). */
	readonly windowLabel: string;
}

/** What the dashboard needs from a single recommendation (per task type). */
export interface IRecommendationRow {
	/** Task type the row corresponds to (e.g. `code-edit`, `summarization`). */
	readonly taskType: string;
	/** Cost↔quality dial used for the ranking (0–10, clamped). */
	readonly dial: number;
	/** The ranked candidates, best-first. Empty when nothing is reachable. */
	readonly ranked: readonly IRankedProvider[];
	/** Provider id the user has pinned for this task type, if any. */
	readonly pinnedId?: string | undefined;
}

/** Inputs to `buildDashboard`. All fields are required except `recommendations` */
export interface IBuildDashboardInput {
	/** The reachable roster (from discovery). */
	readonly available: readonly IProviderCandidate[];
	/** Per-task-type recommendations to render. Optional: missing → empty table. */
	readonly recommendations: readonly IRecommendationRow[];
	/** The aggregated spend picture for the window. */
	readonly spend: ISpendSummary;
}

/**
 * One flat row of the dashboard. Every renderer (CLI, panel, future JSON
 * dump) consumes this shape — no UI logic leaks into the view-model.
 */
export interface IDashboardRow {
	/** Provider id (matches `IProviderCandidate.id`). */
	readonly providerId: string;
	/** Human label; falls back to id when the provider is missing from the
	 * roster. */
	readonly label: string;
	/** Source: `cli` or `api`. */
	readonly source: 'cli' | 'api';
	/** Cost tier 1–5. */
	readonly costTier: 1 | 2 | 3 | 4 | 5;
	/** Whether the user has pinned this provider (anywhere). */
	readonly pinned: boolean;
	/** Per-task-type best-rank score (lowest rank, `null` when not ranked). */
	readonly bestRank: number | null;
	/** Total USD spent on this provider in the window. */
	readonly spendUsd: number;
	/** Invocations against this provider in the window. */
	readonly calls: number;
	/** One-line plain-language summary of WHY this row appears here. */
	readonly note: string;
}

/** What `buildDashboard` returns: a flat row list + a short headline. */
export interface IDashboardViewModel {
	/** The window the spend covers — echoed back so renderers can print it. */
	readonly windowLabel: string;
	/** One-line headline (e.g. "3 reachable · 2 task types · $0.42 this
	 * window"). */
	readonly headline: string;
	/** Total USD across all providers in the window. */
	readonly totalSpendUsd: number;
	/** Total invocations across all providers in the window. */
	readonly totalCalls: number;
	/** The rows, sorted: pinned first, then reachable-by-rank, then missing. */
	readonly rows: readonly IDashboardRow[];
}
