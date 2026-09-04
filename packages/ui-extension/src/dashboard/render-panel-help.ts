/**
 * `renderPanelHelp` — short, scannable tour of every dashboard tab
 * with a 1–2 line description, what data it shows, and a key action
 * the user can take. Lives in its own panel so the user can refer
 * to it whenever they forget what a tab does.
 */
import type { ILangDict } from '@delendai/shared/i18n';

import { extensionText } from '../i18n/extension-text';
import { escapeHtml } from './format';

export interface IHelpEntry {
	readonly id: string;
	readonly label: string;
	readonly purpose: string;
	readonly tip: string;
}

const HELP_ENTRIES: ReadonlyArray<IHelpEntry> = [
	{
		id: 'status',
		label: 'Status',
		purpose: 'Live state of the mcp-vertex MCP server.',
		tip: 'Use this as the home tab. The pulse chip flips to "lost" when MCP is unreachable, the two rings show tokens saved and error rate, and the bottom table lists every active agent with its current proposal and slice.',
	},
	{
		id: 'overview',
		label: 'Overview',
		purpose: 'Server identity, plugin + tool catalogue.',
		tip: 'Static reference of every plugin and tool the server currently exposes. Use it to spot a missing integration at a glance.',
	},
	{
		id: 'logs',
		label: 'Logs',
		purpose: 'Realtime redacted MCP event timeline.',
		tip: 'Switch the source chip to focus on a slice (host, MCP server, external MCP, notifications, errors). Use the search box to filter visible events, and click any row to inspect the full meta payload.',
	},
	{
		id: 'metrics',
		label: 'Metrics',
		purpose: 'Per-tool call count, error count and latency.',
		tip: 'Click any column header to sort. The sparkline next to each tool shows the rolling trend.',
	},
	{
		id: 'tokens',
		label: 'Tokens',
		purpose: 'Tokens used vs tokens saved vs the byte-cost baseline.',
		tip: 'Use the savings percent to validate that the token budget did not regress on this branch.',
	},
	{
		id: 'spend',
		label: 'Spend',
		purpose: 'Real cost + savings data from the usage-tracking plugin.',
		tip: 'Only populated when the usage-tracking opt-in plugin is loaded. Otherwise the panel surfaces a helpful opt-in hint.',
	},
	{
		id: 'tools',
		label: 'Tools',
		purpose: 'Sortable per-tool rollup.',
		tip: 'Sort by calls / errors / avg latency / tokens to find the heaviest tool. Each row links to the tool detail overlay.',
	},
	{
		id: 'plugins',
		label: 'Plugins',
		purpose:
			'Per-plugin tool count, calls, errors, latency and token share.',
		tip: 'The bar chart visualises token share by plugin. The table underneath is sortable.',
	},
	{
		id: 'sessions',
		label: 'Sessions',
		purpose: 'Active proposals in flight.',
		tip: 'Click a row to open the proposal detail overlay with the agent, slice and progress.',
	},
	{
		id: 'times',
		label: 'Times',
		purpose: 'Total wall, p50 / p95 latency and a histogram.',
		tip: 'p95 latency is the best single number to track when investigating slowdowns.',
	},
	{
		id: 'agents',
		label: 'Agents',
		purpose:
			'Every active agent with its current proposal and last heartbeat.',
		tip: 'A stale heartbeat (older than 5 minutes) means the agent is likely wedged or crashed. Open the proposal detail to recover.',
	},
	{
		id: 'memory',
		label: 'Memory',
		purpose: 'Durable cross-session notes.',
		tip: 'Memory is only populated when the memory plugin is loaded. Search by id or title.',
	},
	{
		id: 'health',
		label: 'Health',
		purpose:
			'Server health snapshot — locks, queue, stale agents, suggested actions.',
		tip: 'The "Suggested" column lists the recovery actions the swarm runner would take. Use the proposals board to act on them.',
	},
	{
		id: 'settings',
		label: 'Settings',
		purpose: 'Theme, language, motion, docs URL, log level.',
		tip: 'Changes apply instantly and survive a window reload. The compact-mode toggle is local to your browser.',
	},
];

export const renderPanelHelp = (lang: ILangDict): string => {
	const text = (key: string, fallback: string): string =>
		extensionText(lang, key) || fallback;
	const items = HELP_ENTRIES.map(
		(entry) => `<details class="mcpv-help__entry" open>
			<summary>
				<strong>${escapeHtml(entry.label)}</strong>
				<span class="mcpv-fg-muted">${escapeHtml(entry.purpose)}</span>
			</summary>
			<p>${escapeHtml(entry.tip)}</p>
		</details>`,
	).join('');
	return `<section class="mcpv-panel" id="panel-help" role="tabpanel" aria-labelledby="tab-help">
	<h2 class="mcpv-panel__title">${escapeHtml(text('tabHelp', 'Help'))}</h2>
	<p class="mcpv-fg-muted">${escapeHtml(text('help.lead', 'A short tour of every dashboard panel so you can pick the right tab without guessing.'))}</p>
	<div class="mcpv-help">${items}</div>
</section>`;
};
