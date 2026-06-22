/**
 * `renderToolbar` — the in-extension toolbar webview (the
 * `mcp-vertex.toolbar` activity-bar entry).
 *
 * Renders the shared `HeaderBar` + a 3-column grid of action cards
 * grouped by category. Each card carries `data-mv-action="<id>"`
 * and `data-mv-command="<command>"` so the runtime dispatches the
 * right command to the host.
 *
 * Pure string. The host injects it via
 * `panel.webview.setHtml(renderToolbar({ ... }))`.
 */
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { componentCss, componentScript, renderHeaderBar } from '../components';
import { escapeHtml } from '../dashboard/format';

import {
	QUICK_ACTION_CATEGORIES,
	type QuickAction,
	type QuickActionCategory,
	defaultQuickActions,
	filterByHost,
} from './quick-actions';

export interface IRenderToolbarOptions {
	readonly host: string; // 'vscode' | 'jetbrains' | 'web' | …
	readonly lang: ILangDict;
	readonly version: string;
	readonly loadedPlugins?: readonly string[];
	readonly additionalQuickActions?: readonly QuickAction[];
}

const CATEGORY_LABEL_KEYS: Record<QuickActionCategory, string> = {
	proposals: 'toolbarCategoryProposals',
	knowledge: 'toolbarCategoryKnowledge',
	logs: 'toolbarCategoryLogs',
	docs: 'toolbarCategoryDocs',
	quality: 'toolbarCategoryQuality',
	git: 'toolbarCategoryGit',
	memory: 'toolbarCategoryMemory',
	notification: 'toolbarCategoryNotification',
	deps: 'toolbarCategoryDeps',
	tools: 'toolbarCategoryTools',
};

/** Pick the localized label for an action from the shared `LangDict`. */
const actionLabel = (action: QuickAction, dict: ILangDict): string => {
	const ext = dict.extension as Record<string, string> | undefined;
	return ext?.[action.labelKey] ?? action.labelKey;
};

const categoryLabel = (cat: QuickActionCategory, dict: ILangDict): string => {
	const ext = dict.extension as Record<string, string> | undefined;
	return ext?.[CATEGORY_LABEL_KEYS[cat]] ?? cat;
};

const groupByCategory = (
	actions: readonly QuickAction[],
): ReadonlyMap<QuickActionCategory, readonly QuickAction[]> => {
	const out = new Map<QuickActionCategory, QuickAction[]>();
	for (const cat of QUICK_ACTION_CATEGORIES) out.set(cat, []);
	for (const action of actions) {
		const bucket = out.get(action.category);
		if (bucket) bucket.push(action);
	}
	return out;
};

const renderCard = (action: QuickAction, label: string): string => `<button
	type="button"
	class="mv-toolbar__card"
	data-mv-action="${escapeHtml(action.id)}"
	data-mv-command="${escapeHtml(action.command)}"
>
	<span class="mv-toolbar__card-icon" aria-hidden="true">${escapeHtml(action.icon)}</span>
	<span class="mv-toolbar__card-label">${escapeHtml(label)}</span>
</button>`;

const renderCategory = (
	cat: QuickActionCategory,
	actions: readonly QuickAction[],
	dict: ILangDict,
): string => {
	if (actions.length === 0) return '';
	return `<section class="mv-toolbar__group" data-category="${escapeHtml(cat)}">
		<h2 class="mv-toolbar__group-title">${escapeHtml(categoryLabel(cat, dict))}</h2>
		<div class="mv-toolbar__grid">
			${actions.map((a) => renderCard(a, actionLabel(a, dict))).join('')}
		</div>
	</section>`;
};

/**
 * `renderToolbar` — returns the HTML for the toolbar webview.
 * The host injects this verbatim; the runtime (from S3) handles
 * `data-mv-action` clicks.
 */
export const renderToolbar = (options: IRenderToolbarOptions): string => {
	const all = [
		...defaultQuickActions(),
		...(options.additionalQuickActions ?? []),
	];
	const visible = filterByHost(
		all,
		options.host,
		options.loadedPlugins ?? [],
	);
	const grouped = groupByCategory(visible);
	const header = renderHeaderBar({
		brandName: 'mcp-vertex',
		version: options.version,
		actions: `<span class="mv-toolbar__host" data-host="${escapeHtml(options.host)}">${escapeHtml(options.host)}</span>`,
	});
	const groups = QUICK_ACTION_CATEGORIES.map((cat) =>
		renderCategory(cat, grouped.get(cat) ?? [], options.lang),
	).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>mcp-vertex Toolbar</title>
	<style>${componentCss}
	.mv-toolbar__host {
		font-size: 11px; color: var(--mv-fg-muted, #9aa4b2);
		padding: 4px 8px; border: 1px solid var(--mv-line, #2a3038);
		border-radius: var(--mv-radius-sm, 4px);
	}
	.mv-toolbar__group { margin: 16px 20px; }
	.mv-toolbar__group-title {
		font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
		color: var(--mv-fg-muted, #9aa4b2); margin: 0 0 8px;
	}
	.mv-toolbar__grid {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
	}
	.mv-toolbar__card {
		display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
		padding: 12px;
		background: var(--mv-bg-soft, #11161d);
		color: var(--mv-fg, #e6edf3);
		border: 1px solid var(--mv-line, #2a3038);
		border-radius: var(--mv-radius, 8px);
		font: inherit; text-align: left; cursor: pointer;
		transition: border-color var(--mv-transition-fast, 120ms ease-out);
	}
	.mv-toolbar__card:hover { border-color: var(--mv-brand-blue); }
	.mv-toolbar__card-icon { font-size: 18px; }
	.mv-toolbar__card-label { font-size: 12px; }
	</style>
</head>
<body>
	${header}
	<main class="mv-toolbar__main">
		${groups}
	</main>
	<script>${componentScript}</script>
</body>
</html>`;
};
