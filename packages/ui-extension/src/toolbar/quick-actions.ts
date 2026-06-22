/**
 * `defaultQuickActions` — the canonical 10-action set surfaced by the
 * in-extension toolbar (`mcp-vertex.toolbar` webview).
 *
 * Hosts can extend the set via `additionalQuickActions` when calling
 * `renderToolbar({ ... })`. New plugins can ship their own actions
 * via the `plugin.manifest.tools[].quickAction` field (S5 defers the
 * auto-discovery to a follow-up; the floor covers the 10 most common
 * entry points today).
 *
 * `filterByHost` is the seam: it drops actions whose `requires`
 * includes a plugin not currently loaded, or whose host adapter does
 * not implement the action. This lets future hosts (jetbrains, zed,
 * web) ship a smaller subset without forking the toolbar UI.
 */
export type QuickActionCategory =
	| 'proposals'
	| 'knowledge'
	| 'logs'
	| 'docs'
	| 'quality'
	| 'git'
	| 'memory'
	| 'notification'
	| 'deps'
	| 'tools';

export interface QuickAction {
	readonly id: string;
	readonly labelKey: string; // I18n key under `extension.<key>` in the shared LangDict
	readonly icon: string; // emoji or codicon id
	readonly command: string; // command id the host dispatches
	readonly category: QuickActionCategory;
	/** Plugin ids that must be loaded for this action to be available. */
	readonly requires?: readonly string[];
}

export const QUICK_ACTION_CATEGORIES: readonly QuickActionCategory[] = [
	'proposals',
	'knowledge',
	'logs',
	'docs',
	'quality',
	'git',
	'memory',
	'notification',
	'deps',
	'tools',
];

/**
 * The 10-entry canonical set. Order is stable so the toolbar grid
 * doesn't shuffle on every render.
 */
export const defaultQuickActions = (): readonly QuickAction[] => [
	{
		id: 'proposals.board',
		labelKey: 'openProposalBoard',
		icon: '📋',
		command: 'mcp-vertex.openProposalBoard',
		category: 'proposals',
	},
	{
		id: 'knowledge.openNavigator',
		labelKey: 'openKnowledge',
		icon: '📚',
		command: 'mcp-vertex.openKnowledge',
		category: 'knowledge',
	},
	{
		id: 'logs.openToday',
		labelKey: 'openLogsToday',
		icon: '📜',
		command: 'mcp-vertex.openLogsToday',
		category: 'logs',
		requires: ['logs'],
	},
	{
		id: 'docs.openApi',
		labelKey: 'openDocs',
		icon: '📖',
		command: 'mcp-vertex.openDocs',
		category: 'docs',
	},
	{
		id: 'quality.runValidation',
		labelKey: 'runValidation',
		icon: '✅',
		command: 'mcp-vertex.runValidation',
		category: 'quality',
	},
	{
		id: 'git.status',
		labelKey: 'gitStatus',
		icon: '🔀',
		command: 'mcp-vertex.gitStatus',
		category: 'git',
		requires: ['git'],
	},
	{
		id: 'memory.search',
		labelKey: 'openMemory',
		icon: '🧠',
		command: 'mcp-vertex.openMemory',
		category: 'memory',
	},
	{
		id: 'notification.test',
		labelKey: 'notificationTest',
		icon: '🔔',
		command: 'mcp-vertex.notificationTest',
		category: 'notification',
		requires: ['notification'],
	},
	{
		id: 'deps.check',
		labelKey: 'depsCheck',
		icon: '📦',
		command: 'mcp-vertex.depsCheck',
		category: 'deps',
		requires: ['deps'],
	},
	{
		id: 'web.fetch',
		labelKey: 'webFetch',
		icon: '🌐',
		command: 'mcp-vertex.webFetch',
		category: 'tools',
		requires: ['web-fetch'],
	},
];

/**
 * `filterByHost` — drop actions whose `requires` includes a plugin
 * not in `loadedPlugins`. The `requires` check is the only one today;
 * future hosts can add host-specific filters (e.g. jetbrains can't
 * dispatch `mcp-vertex.gitStatus` because it requires the VS Code
 * SCM) but for now we trust the `requires` field to encode that.
 */
export const filterByHost = (
	actions: readonly QuickAction[],
	_host: string,
	loadedPlugins: readonly string[],
): readonly QuickAction[] => {
	if (loadedPlugins.length === 0) return actions;
	return actions.filter((a) => {
		if (a.requires === undefined || a.requires.length === 0) return true;
		return a.requires.every((p) => loadedPlugins.includes(p));
	});
};
