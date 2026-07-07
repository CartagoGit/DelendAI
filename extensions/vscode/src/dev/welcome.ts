/**
 * `extensions/vscode/src/dev/welcome.ts` — the first-run and quick-start
 * surfaces that show before / above the dashboard.
 *
 * Two render functions, both pure (string in, HTML string out):
 *
 *   - `renderFirstRunScreen(onInstall, onSkip)` — the welcome panel
 *     shown when the workspace isn't fully wired. Explains what the
 *     extension does (4 cards, one per tab), then offers the install
 *     CTA + a "skip and show me the dashboard anyway" link.
 *
 *   - `renderQuickStartMenu()` — a compact collapsible menu shown at
 *     the top of the dashboard when the workspace IS wired. Briefly
 *     explains what each tab does so the user knows where to click.
 *     Stays out of the way once dismissed (sessionStorage).
 */

const escapeHtml = (s: string): string =>
	s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

interface ICardSpec {
	readonly icon: string;
	readonly title: string;
	readonly body: string;
}

const CARDS: readonly ICardSpec[] = [
	{
		icon: '⊞',
		title: 'Dashboard',
		body: 'Real-time metrics for the workspace: token spend, call counts, plugin health, agents working on proposals, slow tools. The single-glance view of how the project is doing.',
	},
	{
		icon: '⚙',
		title: 'Settings',
		body: 'Install the MCP server into this workspace (writes .vscode/mcp.json + .vscode/settings.json + a starter mcp-vertex.config.json). Also lets you pick the dashboard theme and language.',
	},
	{
		icon: '◇',
		title: 'Tool detail',
		body: 'What a single MCP tool looks like when invoked from VS Code: input schema, output schema, knowledge body, last-call metrics. Useful for debugging an integration.',
	},
	{
		icon: '~',
		title: 'Metrics',
		body: 'A sparkline of per-tool call counts over time. Compare tools side-by-side to spot regressions.',
	},
];

const QUICK_START_KEY = 'mv:dev:quickstart-dismissed';

export const isQuickStartDismissed = (): boolean => {
	try {
		return sessionStorage.getItem(QUICK_START_KEY) === '1';
	} catch {
		return false;
	}
};

export const dismissQuickStart = (): void => {
	try {
		sessionStorage.setItem(QUICK_START_KEY, '1');
	} catch {
		// sessionStorage disabled — fine, the menu just shows again next load.
	}
};

export const renderFirstRunScreen = (installLabel: string): string => {
	const cardsHtml = CARDS.map(
		(card) => `<article class="welcome__card">
			<div class="welcome__card-icon" aria-hidden="true">${escapeHtml(card.icon)}</div>
			<h3>${escapeHtml(card.title)}</h3>
			<p>${escapeHtml(card.body)}</p>
		</article>`,
	).join('');

	return `<section class="welcome" data-first-run="true">
		<header class="welcome__head">
			<h1>Welcome to mcp-vertex</h1>
			<p class="welcome__lede">This extension ships a dashboard, settings, and a tools panel for the <code>mcp-vertex</code> MCP server. The MCP server is not installed in this workspace yet — once it is, the dashboard will switch to fetching real data from it.</p>
		</header>
		<div class="welcome__grid">
			${cardsHtml}
		</div>
		<footer class="welcome__cta">
			<button type="button" id="welcome-install" class="welcome__primary" data-action="open-settings">${escapeHtml(installLabel)}</button>
			<button type="button" id="welcome-skip" class="welcome__secondary" data-action="skip-to-dashboard">Skip — show me the dashboard anyway</button>
		</footer>
	</section>`;
};

export const renderQuickStartMenu = (): string => {
	const itemsHtml = CARDS.map(
		(card) => `<li class="quickstart__item">
			<span class="quickstart__icon" aria-hidden="true">${escapeHtml(card.icon)}</span>
			<div>
				<strong>${escapeHtml(card.title)}.</strong>
				<span class="quickstart__desc">${escapeHtml(card.body)}</span>
			</div>
		</li>`,
	).join('');

	return `<aside class="quickstart" role="complementary">
		<header class="quickstart__head">
			<h2>Quick start</h2>
			<button type="button" id="quickstart-dismiss" class="quickstart__close" aria-label="Dismiss quick start">×</button>
		</header>
		<p class="quickstart__lede">A one-time orientation. The workspace is wired and the dashboard is now pulling real data — here's what each tab does.</p>
		<ul class="quickstart__list">${itemsHtml}</ul>
	</aside>`;
};
