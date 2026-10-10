/**
 * provider-dashboard-webview.ts — f00098 S3.
 *
 * Pure HTML renderer for the provider dashboard panel: the S1
 * provider-status model + the S2 usage-cost card, both produced by the
 * host-agnostic builders in `@delendai/ui-extension`. This module is a
 * THIN presentation adapter — no tool calls, no business logic, no
 * scripts (the default-deny CSP applies as-is, same posture as
 * `renderJsonHtml`). Actions live in `commands/provider-actions.ts` and
 * are reachable from the command palette; the panel re-renders when
 * those commands (or the global refresh) run — never by polling
 * (f00098 non-goal).
 *
 * Theme-aware: colors come from the host's `--vscode-*` CSS variables so
 * the panel follows the active theme in both directions.
 */
import {
	DEFAULT_DENY,
	injectCspMeta,
	type IProviderStatusModel,
	type IProviderStatusRow,
	type IModelAttributionModel,
	type IUsageCostCardModel,
} from '@delendai/ui-extension/public';

import type { IProviderDashboardStrings } from '../i18n/provider-dashboard.strings';
import { escapeHtml } from './render-output-schema';

const STYLE = `<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0 1rem 2rem; }
h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 1.5rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--vscode-widget-border, #8884); }
code { font-family: var(--vscode-editor-font-family, monospace); }
.muted { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
.chip { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.chip--ok { background: color-mix(in srgb, var(--vscode-charts-green, #2a9d3f) 22%, transparent); color: var(--vscode-charts-green, #2a9d3f); }
.chip--warn { background: color-mix(in srgb, var(--vscode-charts-yellow, #e0a800) 22%, transparent); color: var(--vscode-charts-yellow, #a07800); }
.chip--down { background: color-mix(in srgb, var(--vscode-charts-red, #d64545) 18%, transparent); color: var(--vscode-charts-red, #d64545); }
.meter { margin: 0.15rem 0 0.3rem; }
.meter__label { display: block; font-size: 0.72rem; font-family: var(--vscode-editor-font-family, monospace); color: var(--vscode-descriptionForeground); }
.meter__track { display: block; height: 0.35rem; border-radius: 999px; background: var(--vscode-widget-border, #8884); overflow: hidden; }
.meter__fill { display: block; height: 100%; border-radius: 999px; background: var(--vscode-charts-green, #2a9d3f); }
.meter__fill--over { background: var(--vscode-charts-red, #d64545); }
.optin { border-left: 3px solid var(--vscode-charts-yellow, #e0a800); background: var(--vscode-textBlockQuote-background, #8881); padding: 0.6rem 0.9rem; border-radius: 0 4px 4px 0; }
.optin pre { background: var(--vscode-textCodeBlock-background, #8882); padding: 0.5rem 0.75rem; border-radius: 4px; overflow-x: auto; }
.kpis { display: flex; flex-wrap: wrap; gap: 1.25rem; margin: 0.5rem 0 1rem; }
.kpi { min-width: 0; } .kpi__label { display: block; font-size: 0.72rem; color: var(--vscode-descriptionForeground); }
.kpi__value { font-size: 1.05rem; font-weight: 600; }
</style>`;

const stateChipClass = (state: IProviderStatusRow['state']): string => {
	if (state === 'available') return 'chip chip--ok';
	if (state === 'quota-exceeded' || state === 'rate-limited') {
		return 'chip chip--warn';
	}
	return 'chip chip--down';
};

const meterHtml = (
	label: string,
	pct: number | null,
	over: boolean,
): string => {
	const track =
		pct === null
			? ''
			: `<span class="meter__track"><span class="meter__fill${over ? ' meter__fill--over' : ''}" style="width:${Math.min(pct, 100)}%"></span></span>`;
	return `<div class="meter"><span class="meter__label">${escapeHtml(label)}</span>${track}</div>`;
};

const optInHtml = (title: string, hint: string, snippet: string): string =>
	`<div class="optin"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml(hint)}</p><pre><code>${escapeHtml(snippet)}</code></pre></div>`;

const providerRowHtml = (
	row: IProviderStatusRow,
	s: IProviderDashboardStrings,
): string => {
	const cli = row.cliInstalled
		? `✓ ${escapeHtml(row.cliVersion ?? '')}`
		: '—';
	const hint =
		row.installHint === null
			? ''
			: `<div class="muted">${escapeHtml(s.installHint)}: <code>${escapeHtml(row.installHint.command)}</code>${row.installHint.dangerous ? ' ⚠' : ''}</div>`;
	const auth =
		row.authenticated === null
			? '—'
			: row.authenticated
				? `✓${row.authTier === null ? '' : ` (${escapeHtml(row.authTier)})`}`
				: '✗';
	const quota =
		row.quota.length === 0
			? `<span class="muted">${escapeHtml(s.noQuota)}</span>`
			: row.quota
					.map((q) =>
						meterHtml(
							`${q.window}: ${q.used ?? '?'} / ${q.limit ?? '?'}`,
							q.usedPct,
							q.usedPct !== null && q.usedPct > 100,
						),
					)
					.join('');
	return `<tr>
<th scope="row"><code>${escapeHtml(row.id)}</code></th>
<td><span class="${stateChipClass(row.state)}" title="${escapeHtml(row.reachable ? s.reachable : s.unreachable)}">${escapeHtml(row.state)}</span></td>
<td><code>${escapeHtml(row.modelId)}</code>${row.modelAvailable === false ? ' ⚠' : ''}</td>
<td>${cli}${hint}</td>
<td>${auth}</td>
<td>${quota}</td>
</tr>`;
};

const providersSectionHtml = (
	model: IProviderStatusModel,
	s: IProviderDashboardStrings,
): string => {
	if (model.kind === 'plugin-absent') {
		return optInHtml(s.optInTitle, model.hint, model.configSnippet);
	}
	if (model.emptyRoster) {
		return `<p class="muted">${escapeHtml(s.emptyRoster)}</p>`;
	}
	const head = `<p class="muted">${escapeHtml(s.checkedAt)} ${escapeHtml(model.checkedAt)} — ${model.summary.total} ${escapeHtml(s.total)} · ${model.summary.available} ${escapeHtml(s.available)} · ${model.summary.unavailable} ${escapeHtml(s.unavailable)}</p>`;
	return `${head}
<table>
<thead><tr><th scope="col">${escapeHtml(s.colProvider)}</th><th scope="col">${escapeHtml(s.colState)}</th><th scope="col">${escapeHtml(s.colModel)}</th><th scope="col">${escapeHtml(s.colCli)}</th><th scope="col">${escapeHtml(s.colAuth)}</th><th scope="col">${escapeHtml(s.colQuota)}</th></tr></thead>
<tbody>${model.rows.map((row) => providerRowHtml(row, s)).join('')}</tbody>
</table>`;
};

const usageSectionHtml = (
	model: IUsageCostCardModel,
	s: IProviderDashboardStrings,
): string => {
	if (model.kind === 'plugin-absent') {
		return optInHtml(s.optInTitle, model.hint, model.configSnippet);
	}
	const kpis = `<div class="kpis">
<div class="kpi"><span class="kpi__label">${escapeHtml(s.totalSpend)}</span><span class="kpi__value">$${model.totals.costUsd.toFixed(4)}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.calls)}</span><span class="kpi__value">${model.totals.calls}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.tokens)}</span><span class="kpi__value">${model.totals.totalTokens}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.errors)}</span><span class="kpi__value">${model.totals.errors}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.windowDays)}</span><span class="kpi__value">${model.windowDays}</span></div>
</div>`;
	// The two cap scopes render as two INDEPENDENT meters — never combined
	// or averaged (circuit-breaker semantics, f00098 S2 acceptance).
	const meters = model.limitsAvailable
		? model.meters
				.map((m) => {
					const label =
						m.scope === 'session' ? s.sessionMeter : s.monthlyMeter;
					const cap =
						m.limitUsd === null
							? s.uncapped
							: `$${m.spendUsd.toFixed(2)} / $${m.limitUsd.toFixed(2)}`;
					const breach = m.breached
						? ` <span class="chip chip--down">${escapeHtml(s.breached)}</span>`
						: '';
					return `${meterHtml(`${label}: ${cap}`, m.pct, m.breached)}${breach}`;
				})
				.join('')
		: `<p class="muted">${escapeHtml(s.limitsUnavailable)}</p>`;
	if (model.empty) {
		return `${kpis}${meters}<p class="muted">${escapeHtml(s.emptyLog)}</p>`;
	}
	const rows = model.rows
		.map(
			(row) => `<tr>
<th scope="row"><code>${escapeHtml(row.key)}</code></th>
<td>${row.calls}</td>
<td>${row.totalTokens}</td>
<td>$${row.costUsd.toFixed(4)}</td>
<td>${row.errors}</td>
<td>${row.costSharePct === null ? '—' : `${row.costSharePct}%`}</td>
</tr>`,
		)
		.join('');
	return `${kpis}${meters}
<table>
<thead><tr><th scope="col">${escapeHtml(model.groupBy)}</th><th scope="col">${escapeHtml(s.calls)}</th><th scope="col">${escapeHtml(s.tokens)}</th><th scope="col">$</th><th scope="col">${escapeHtml(s.errors)}</th><th scope="col">${escapeHtml(s.share)}</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
};

const modelAttributionHtml = (
	model: IModelAttributionModel,
	s: IProviderDashboardStrings,
): string => {
	if (model.kind === 'plugin-absent') {
		return optInHtml(s.optInTitle, model.hint, model.configSnippet);
	}
	if (model.empty) return `<p class="muted">${escapeHtml(s.emptyLog)}</p>`;
	const rows = model.rows
		.map(
			(row) =>
				`<tr><th scope="row"><code>${escapeHtml(row.key)}</code></th><td>${row.calls}</td><td>${row.totalTokens}</td><td>$${row.costUsd.toFixed(4)}</td><td>${row.tokensSaved}</td><td>${row.savingsPercent}%</td><td>${meterHtml('', row.savingsBarPct, false)}</td></tr>`,
		)
		.join('');
	return `<table><thead><tr><th>${escapeHtml(s.colModel)}</th><th>${escapeHtml(s.calls)}</th><th>${escapeHtml(s.tokens)}</th><th>$</th><th>${escapeHtml(s.tokens)} ↓</th><th>%</th><th>${escapeHtml(s.share)}</th></tr></thead><tbody>${rows}</tbody></table>`;
};

export interface IProviderDashboardViewModel {
	readonly providers: IProviderStatusModel;
	readonly usage: IUsageCostCardModel;
	readonly modelAttribution: IModelAttributionModel;
}

export const renderProviderDashboardHtml = (
	model: IProviderDashboardViewModel,
	s: IProviderDashboardStrings,
): string =>
	injectCspMeta(
		`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(s.title)}</title>
	${STYLE}
</head>
<body>
	<h1>${escapeHtml(s.title)}</h1>
	<section><h2>${escapeHtml(s.providersTitle)}</h2>${providersSectionHtml(model.providers, s)}</section>
	<section><h2>${escapeHtml(s.usageTitle)}</h2>${usageSectionHtml(model.usage, s)}</section>
	<section><h2>${escapeHtml(s.usageTitle)} — ${escapeHtml(s.colModel)}</h2>${modelAttributionHtml(model.modelAttribution, s)}</section>
</body>
</html>`,
		DEFAULT_DENY,
	);
