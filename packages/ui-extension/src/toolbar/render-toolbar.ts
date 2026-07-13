/**
 * `renderToolbar` — the in-extension toolbar webview (the
 * `mcp-vertex.toolbar` activity-bar entry).
 *
 * Renders the shared `HeaderBar` + a 3-column grid of action cards
 * grouped by category. Each card carries `data-mcpv-action="<id>"`
 * and `data-mcpv-command="<command>"` so the runtime dispatches the
 * right command to the host.
 *
 * Pure string. The host injects it via
 * `panel.webview.setHtml(renderToolbar({ ... }))`.
 */
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import {
	componentCss,
	componentScript,
	renderHeaderBar,
	renderHostBridge,
} from '../components';
import { escapeHtml } from '../dashboard/format';

import {
	QUICK_ACTION_CATEGORIES,
	type QuickAction,
	type QuickActionCategory,
	defaultQuickActions,
	filterByHost,
} from './quick-actions';
import { extensionText } from '../i18n/extension-text';

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
	class="mcpv-toolbar__card"
	data-mcpv-action="${escapeHtml(action.id)}"
	data-mcpv-command="${escapeHtml(action.command)}"
>
	<span class="mcpv-toolbar__card-icon" aria-hidden="true">${escapeHtml(action.icon)}</span>
	<span class="mcpv-toolbar__card-label">${escapeHtml(label)}</span>
</button>`;

const renderCategory = (
	cat: QuickActionCategory,
	actions: readonly QuickAction[],
	dict: ILangDict,
): string => {
	if (actions.length === 0) return '';
	return `<section class="mcpv-toolbar__group" data-category="${escapeHtml(cat)}">
		<h2 class="mcpv-toolbar__group-title">${escapeHtml(categoryLabel(cat, dict))}</h2>
		<div class="mcpv-toolbar__grid">
			${actions.map((a) => renderCard(a, actionLabel(a, dict))).join('')}
		</div>
	</section>`;
};

/**
 * `renderToolbar` — returns the HTML for the toolbar webview.
 * The host injects this verbatim; the runtime (from S3) handles
 * `data-mcpv-action` clicks.
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
	const text = (key: string) => extensionText(options.lang, key);
	const grouped = groupByCategory(visible);
	const header = renderHeaderBar({
		brandName: 'mcp-vertex',
		version: options.version,
		actions: `<span class="mcpv-toolbar__host" data-host="${escapeHtml(options.host)}">${escapeHtml(options.host)}</span>`,
	});
	const groups = QUICK_ACTION_CATEGORIES.map((cat) =>
		renderCategory(cat, grouped.get(cat) ?? [], options.lang),
	).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(text('toolbar.title'))}</title>
	<style>${componentCss}
	.mcpv-toolbar__host {
		font-size: 11px; color: var(--mcpv-fg-muted, #9aa4b2);
		padding: 4px 8px; border: 1px solid var(--mcpv-line, #2a3038);
		border-radius: var(--mcpv-radius-sm, 4px);
	}
	.mcpv-toolbar__group { margin: 16px 20px; }
	.mcpv-toolbar__group-title {
		font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
		color: var(--mcpv-fg-muted, #9aa4b2); margin: 0 0 8px;
	}
	.mcpv-toolbar__grid {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
	}
	.mcpv-toolbar__card {
		display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
		padding: 12px;
		background: var(--mcpv-bg-soft, #11161d);
		color: var(--mcpv-fg, #e6edf3);
		border: 1px solid var(--mcpv-line, #2a3038);
		border-radius: var(--mcpv-radius, 8px);
		font: inherit; text-align: left; cursor: pointer;
		transition: border-color var(--mcpv-transition-fast, 120ms ease-out);
	}
	.mcpv-toolbar__card:hover { border-color: var(--mcpv-brand-blue); }
	.mcpv-toolbar__card-icon { font-size: 18px; }
	.mcpv-toolbar__card-label { font-size: 12px; }
	</style>
</head>
<body>
	${header}
	<main class="mcpv-toolbar__main">
		${groups}
	</main>
	${renderHostBridge()}
	<script>${componentScript}</script>
</body>
</html>`;
};
