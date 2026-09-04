/**
 * router-dashboard-webview.ts — f00140 S3.
 *
 * Pure HTML renderer for the router recommendation + spend dashboard
 * panel. Consumes the shared `IDashboardViewModel` produced by
 * `buildDashboard` in `@delendai/auto-agent-selector/public` so the
 * VS Code extension renders the same rows the `mcpv router` CLI prints
 * — no second projection, no second copy of the view-model.
 *
 * The webview never calls a tool: the host's command wiring
 * (`commands/provider-actions.ts`) fetches the data and repaints the
 * panel. This module is presentation only — same posture as
 * `provider-dashboard-webview.ts`. Default-deny CSP (no scripts); the
 * panel re-renders on demand, never polls.
 *
 * Theme-aware: colors come from `--vscode-*` CSS variables so the panel
 * follows the active theme.
 */
// Direct import avoids loading `render-dashboard.ts` (which transitively
// pulls `dashboard.scss` via `@delendai/shared/styles/dashboard-css`);
// the SCSS pipeline runs in the build step, not in unit tests.
import {
	DEFAULT_DENY,
	injectCspMeta,
} from '@delendai/ui-extension/webview/csp';
import type {
	IDashboardRow,
	IDashboardViewModel,
} from '@delendai/auto-agent-selector/public';

import type { IRouterDashboardStrings } from '../i18n/router-dashboard.strings';
import { escapeHtml } from './render-output-schema';

const STYLE = `<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0 1rem 2rem; }
h1 { font-size: 1.3rem; } h2 { font-size: 1.05rem; margin-top: 1.5rem; }
.kpis { display: flex; flex-wrap: wrap; gap: 1.25rem; margin: 0.5rem 0 1rem; }
.kpi { min-width: 0; } .kpi__label { display: block; font-size: 0.72rem; color: var(--vscode-descriptionForeground); }
.kpi__value { font-size: 1.05rem; font-weight: 600; }
.muted { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--vscode-widget-border, #8884); }
code { font-family: var(--vscode-editor-font-family, monospace); }
.chip { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.chip--pin { background: color-mix(in srgb, var(--vscode-charts-blue, #4d8eff) 22%, transparent); color: var(--vscode-charts-blue, #4d8eff); }
.chip--warn { background: color-mix(in srgb, var(--vscode-charts-yellow, #e0a800) 22%, transparent); color: var(--vscode-charts-yellow, #a07800); }
.tier { font-family: var(--vscode-editor-font-family, monospace); font-weight: 600; }
</style>`;

const formatUsd = (value: number): string =>
	`$${value.toFixed(value < 10 ? 2 : 0)}`;

const rowHtml = (row: IDashboardRow): string => {
	const pin = row.pinned ? `<span class="chip chip--pin">★</span>` : '';
	const rank =
		row.bestRank === null
			? `<span class="muted">—</span>`
			: `<span class="tier">#${row.bestRank}</span>`;
	const spend = row.spendUsd === 0 ? '—' : formatUsd(row.spendUsd);
	return `<tr>
<th scope="row"><code>${escapeHtml(row.providerId)}</code> ${pin}</th>
<td>${escapeHtml(row.label)}</td>
<td><span class="tier">${row.costTier}</span></td>
<td>${rank}</td>
<td>${spend}</td>
<td>${row.calls}</td>
<td class="muted">${escapeHtml(row.note)}</td>
</tr>`;
};

const kpiHtml = (
	vm: IDashboardViewModel,
	s: IRouterDashboardStrings,
): string => `
<div class="kpis">
<div class="kpi"><span class="kpi__label">${escapeHtml(s.windowLabel)}</span><span class="kpi__value">${escapeHtml(vm.windowLabel)}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.totalSpend)}</span><span class="kpi__value">${formatUsd(vm.totalSpendUsd)}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.totalCalls)}</span><span class="kpi__value">${vm.totalCalls}</span></div>
<div class="kpi"><span class="kpi__label">${escapeHtml(s.reachable)}</span><span class="kpi__value">${vm.rows.filter((r) => r.bestRank !== null).length}</span></div>
</div>`;

export const renderRouterDashboardHtml = (
	vm: IDashboardViewModel,
	s: IRouterDashboardStrings,
): string => {
	const table =
		vm.rows.length === 0
			? `<p class="muted">${escapeHtml(s.emptyRows)}</p>`
			: `<table>
<thead><tr><th scope="col">${escapeHtml(s.colProvider)}</th><th scope="col">${escapeHtml(s.colLabel)}</th><th scope="col">${escapeHtml(s.colTier)}</th><th scope="col">${escapeHtml(s.colRank)}</th><th scope="col">${escapeHtml(s.colSpend)}</th><th scope="col">${escapeHtml(s.colCalls)}</th><th scope="col">${escapeHtml(s.colNote)}</th></tr></thead>
<tbody>${vm.rows.map(rowHtml).join('')}</tbody>
</table>`;
	return injectCspMeta(
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
<p class="muted">${escapeHtml(vm.headline)}</p>
${kpiHtml(vm, s)}
<h2>${escapeHtml(s.tableTitle)}</h2>
${table}
<p class="muted">${escapeHtml(s.footer)}</p>
</body>
</html>`,
		DEFAULT_DENY,
	);
};
