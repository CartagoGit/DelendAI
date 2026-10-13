/**
 * agent-timeline.ts — f00192 (Track J / agent timeline).
 *
 * The VSCode view that renders an Agent Timeline. Pure HTML
 * renderer + a tiny projection helper — no `vscode` import in the
 * render path so the spec can run in Node. The host command opens
 * this in a webview panel.
 *
 * Design notes (SRP + OCP):
 *   - `renderAgentTimeline(model)` is the entire visual surface;
 *     the command only feeds it data + i18n copy.
 *   - `ITimelineViewModel` is the projection contract — the core
 *     `ITimelineLog` is mapped onto it once by the command, so the
 *     view does not need to know about the core's exact types.
 *   - Filter chips (by plugin + by kind) are query-string driven;
 *     the command parses `?plugin=…&kind=…` and rebuilds the model
 *     with the filtered events. The HTML form posts back via a
 *     no-script GET (no inline JS, no CSP widening).
 *   - Privacy: every free-text field has already been redacted by
 *     the core (see `redactFreeText`); the view escapes HTML on top
 *     of that, never the other way around.
 */

import {
	formatEventTimestamp,
	type ITimelineEvent,
	type ITimelineLog,
	type TimelineEventKind,
} from '@delendai/core/public';

import { DEFAULT_DENY, injectCspMeta } from '@delendai/ui-extension/webview';

import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
import { viewCopyFor } from '../i18n/view-copy.strings';
import { escapeHtml } from './render-output-schema';

export interface ITimelineViewModel {
	readonly events: readonly ITimelineEvent[];
	readonly kindFilter: TimelineEventKind | null;
	readonly pluginFilter: string | null;
	readonly availablePlugins: readonly string[];
	readonly totalCount: number;
}

export interface ITimelineViewOptions {
	/** Optional href for the "copy" button (kept here so the i18n
	 *  copy can wrap it without leaking a tool name). */
	readonly refreshHref?: string;
	readonly copy?: IViewCopy;
}

/**
 * Project a core `ITimelineLog` + filter parameters into the view
 * model. Pure.
 */
export const projectTimelineView = (
	log: ITimelineLog,
	filters: {
		readonly kind?: TimelineEventKind | null;
		readonly plugin?: string | null;
	},
): ITimelineViewModel => {
	const allPlugins = new Set<string>();
	for (const event of log.events) {
		if (event.plugin !== undefined) allPlugins.add(event.plugin);
	}
	const events = log.events.filter((event) => {
		if (
			filters.kind !== undefined &&
			filters.kind !== null &&
			event.kind !== filters.kind
		) {
			return false;
		}
		if (
			filters.plugin !== undefined &&
			filters.plugin !== null &&
			event.plugin !== filters.plugin
		) {
			return false;
		}
		return true;
	});
	return {
		events,
		kindFilter: filters.kind ?? null,
		pluginFilter: filters.plugin ?? null,
		availablePlugins: [...allPlugins].sort(),
		totalCount: log.events.length,
	};
};

const ALL_KINDS: readonly TimelineEventKind[] = [
	'claim',
	'activate',
	'change',
	'test',
	'cost',
	'commit',
	'close',
	'note',
];

const kindChip = (event: ITimelineEvent): string =>
	`<span class="agent-timeline__kind agent-timeline__kind--${escapeHtml(event.kind)}">${escapeHtml(event.kind)}</span>`;

const renderEvent = (event: ITimelineEvent, copy: IViewCopy): string => {
	const rows: string[] = [];
	rows.push(
		`<header class="agent-timeline__head">${kindChip(event)} <time>${escapeHtml(formatEventTimestamp(event.ts))}</time></header>`,
	);
	if (event.plugin !== undefined || event.sliceId !== undefined) {
		const plugin =
			event.plugin !== undefined ? event.plugin : copy.timelineEmptyValue;
		const slice =
			event.sliceId !== undefined
				? event.sliceId
				: copy.timelineEmptyValue;
		rows.push(
			`<p class="agent-timeline__where"><strong>${escapeHtml(copy.timelinePlugin)}:</strong> <code>${escapeHtml(plugin)}</code> · <strong>${escapeHtml(copy.timelineSlice)}:</strong> <code>${escapeHtml(slice)}</code></p>`,
		);
	}
	if (event.cost !== undefined) {
		rows.push(
			`<p class="agent-timeline__cost"><strong>${escapeHtml(copy.timelineCost)}:</strong> ${event.cost} ${escapeHtml(copy.timelineTokens)}</p>`,
		);
	}
	if (event.commitSha !== undefined) {
		rows.push(
			`<p class="agent-timeline__commit"><strong>${escapeHtml(copy.timelineCommit)}:</strong> <code>${escapeHtml(event.commitSha)}</code></p>`,
		);
	}
	if (event.why !== undefined && event.why.length > 0) {
		rows.push(
			`<p class="agent-timeline__why"><strong>${escapeHtml(copy.timelineWhy)}:</strong> ${escapeHtml(event.why)}</p>`,
		);
	}
	if (event.inputs !== undefined && event.inputs.length > 0) {
		rows.push(
			`<p class="agent-timeline__inputs"><strong>${escapeHtml(copy.timelineInputs)}:</strong> <code>${escapeHtml(event.inputs)}</code></p>`,
		);
	}
	if (event.outputs !== undefined && event.outputs.length > 0) {
		rows.push(
			`<p class="agent-timeline__outputs"><strong>${escapeHtml(copy.timelineOutputs)}:</strong> <code>${escapeHtml(event.outputs)}</code></p>`,
		);
	}
	if (event.meta !== undefined && Object.keys(event.meta).length > 0) {
		const metaRows = Object.entries(event.meta)
			.map(
				([key, value]) =>
					`<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`,
			)
			.join('');
		rows.push(`<dl class="agent-timeline__meta">${metaRows}</dl>`);
	}
	return `<li class="agent-timeline__item">${rows.join('\n')}</li>`;
};

const renderFilters = (model: ITimelineViewModel, copy: IViewCopy): string => {
	const pluginOptions = [
		`<option value="">${escapeHtml(copy.timelineAnyPlugin)}</option>`,
		...model.availablePlugins.map(
			(plugin) =>
				`<option value="${escapeHtml(plugin)}"${model.pluginFilter === plugin ? ' selected' : ''}>${escapeHtml(plugin)}</option>`,
		),
	];
	const kindOptions = [
		`<option value="">${escapeHtml(copy.timelineAnyKind)}</option>`,
		...ALL_KINDS.map(
			(kind) =>
				`<option value="${escapeHtml(kind)}"${model.kindFilter === kind ? ' selected' : ''}>${escapeHtml(kind)}</option>`,
		),
	];
	// GET form → the host command parses the query string and
	// re-renders. No inline JS, no extra CSP needed.
	return `<form class="agent-timeline__filters" method="get" action="">
		<label>${escapeHtml(copy.timelinePlugin)} <select name="plugin">${pluginOptions.join('')}</select></label>
		<label>${escapeHtml(copy.timelineKind)} <select name="kind">${kindOptions.join('')}</select></label>
		<button type="submit">${escapeHtml(copy.timelineApply)}</button>
		<a class="agent-timeline__reset" href="?">${escapeHtml(copy.timelineReset)}</a>
	</form>`;
};

const STYLE = `<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0 1rem 2rem; }
h1 { font-size: 1.3rem; margin: 0.4rem 0 1rem; }
.muted { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }
.agent-timeline__filters { display: flex; gap: 0.75rem; align-items: center; padding: 0.5rem 0 1rem; border-bottom: 1px solid var(--vscode-widget-border, #8884); margin-bottom: 1rem; }
.agent-timeline__filters label { display: flex; gap: 0.25rem; align-items: center; font-size: 0.8rem; color: var(--vscode-descriptionForeground); }
.agent-timeline__filters select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); padding: 0.15rem 0.35rem; }
.agent-timeline__filters button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 0.25rem 0.6rem; cursor: pointer; }
.agent-timeline__filters .agent-timeline__reset { font-size: 0.8rem; color: var(--vscode-textLink-foreground); text-decoration: none; }
.agent-timeline { list-style: none; margin: 0; padding: 0; position: relative; }
.agent-timeline::before { content: ''; position: absolute; left: 9px; top: 0; bottom: 0; width: 2px; background: var(--vscode-widget-border, #8884); }
.agent-timeline__item { position: relative; padding: 0.5rem 0.75rem 0.75rem 2rem; border-bottom: 1px dashed var(--vscode-widget-border, #8884); }
.agent-timeline__item::before { content: ''; position: absolute; left: 5px; top: 0.85rem; width: 10px; height: 10px; border-radius: 999px; background: var(--vscode-badge-background); border: 2px solid var(--vscode-editor-background); }
.agent-timeline__head { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--vscode-descriptionForeground); }
.agent-timeline__kind { display: inline-block; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.agent-timeline__kind--commit { background: color-mix(in srgb, var(--vscode-charts-green, #2a9d3f) 22%, transparent); color: var(--vscode-charts-green, #2a9d3f); }
.agent-timeline__kind--cost { background: color-mix(in srgb, var(--vscode-charts-yellow, #e0a800) 22%, transparent); color: var(--vscode-charts-yellow, #a07800); }
.agent-timeline__kind--test { background: color-mix(in srgb, var(--vscode-charts-blue, #3a8edb) 22%, transparent); color: var(--vscode-charts-blue, #2a6fb8); }
.agent-timeline__kind--close { background: color-mix(in srgb, var(--vscode-charts-purple, #8b5cf6) 22%, transparent); color: var(--vscode-charts-purple, #6b3fbf); }
.agent-timeline__where, .agent-timeline__cost, .agent-timeline__commit, .agent-timeline__why, .agent-timeline__inputs, .agent-timeline__outputs { margin: 0.2rem 0; font-size: 0.82rem; }
.agent-timeline__why strong, .agent-timeline__inputs strong, .agent-timeline__outputs strong, .agent-timeline__where strong, .agent-timeline__cost strong, .agent-timeline__commit strong { color: var(--vscode-descriptionForeground); font-weight: 500; }
.agent-timeline__meta { display: grid; grid-template-columns: max-content 1fr; column-gap: 0.6rem; row-gap: 0.1rem; margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--vscode-descriptionForeground); }
.agent-timeline__meta dt { font-family: var(--vscode-editor-font-family, monospace); }
.agent-timeline__meta dd { margin: 0; }
code { font-family: var(--vscode-editor-font-family, monospace); }
</style>`;

export const renderAgentTimeline = (
	model: ITimelineViewModel,
	options: ITimelineViewOptions = {},
): string => {
	const copy = options.copy ?? viewCopyFor('en');
	const headerRight = options.refreshHref
		? `<a href="${escapeHtml(options.refreshHref)}">${escapeHtml(copy.timelineRefresh)}</a>`
		: '';
	const body =
		model.events.length === 0
			? `<p class="muted">${escapeHtml(copy.timelineNoMatches)} ${escapeHtml(copy.timelineShowingTotal)} ${model.totalCount} ${escapeHtml(copy.timelineTotalEvents)}</p>`
			: `<ol class="agent-timeline">${model.events.map((event) => renderEvent(event, copy)).join('\n')}</ol>`;
	return `<!DOCTYPE html>
<html lang="${escapeHtml(copy.lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(copy.timelineTitle)}</title>
${injectCspMeta('', DEFAULT_DENY)}
${STYLE}
</head>
<body>
<header style="display:flex;justify-content:space-between;align-items:center;">
<h1>${escapeHtml(copy.timelineTitle)}</h1>${headerRight}
</header>
${renderFilters(model, copy)}
${body}
</body>
</html>`;
};

/**
 * Render just the `<body>` of the view (no `<html>` envelope) so
 * dev-preview pages can mount it inside their own shell without
 * double-parsing. The body uses the `agent-timeline` BEM tree, the
 * same CSS the full page inlines.
 */
export const renderAgentTimelineBody = (
	model: ITimelineViewModel,
	options: ITimelineViewOptions = {},
): string => {
	const copy = options.copy ?? viewCopyFor('en');
	const headerRight = options.refreshHref
		? `<a href="${escapeHtml(options.refreshHref)}">${escapeHtml(copy.timelineRefresh)}</a>`
		: '';
	const body =
		model.events.length === 0
			? `<p class="muted">${escapeHtml(copy.timelineNoMatches)} ${escapeHtml(copy.timelineShowingTotal)} ${model.totalCount} ${escapeHtml(copy.timelineTotalEvents)}</p>`
			: `<ol class="agent-timeline">${model.events.map((event) => renderEvent(event, copy)).join('\n')}</ol>`;
	return `<section class="agent-timeline-page">
<header class="agent-timeline__page-header">
<h1>${escapeHtml(copy.timelineTitle)}</h1>${headerRight}
</header>
${renderFilters(model, copy)}
${body}
</section>`;
};

/** Parse a query string into filter args. Pure. */
export const parseTimelineQuery = (
	query: string,
): { kind: TimelineEventKind | null; plugin: string | null } => {
	const params = new URLSearchParams(query);
	const kindRaw = params.get('kind');
	const pluginRaw = params.get('plugin');
	const kind =
		kindRaw !== null && (ALL_KINDS as readonly string[]).includes(kindRaw)
			? (kindRaw as TimelineEventKind)
			: null;
	const plugin =
		pluginRaw !== null && pluginRaw.length > 0 ? pluginRaw : null;
	return { kind, plugin };
};
