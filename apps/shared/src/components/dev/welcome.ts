/**
 * `apps/shared/src/components/dev/welcome.ts` — host-agnostic
 * first-run + quick-start menu renderers. Return HTML strings.
 *
 * Replaces the inline `renderFirstRunScreen` / `renderQuickStartMenu`
 * in `extensions/vscode/src/dev/welcome.ts` (f00102 S4.6) so any
 * surface that wants the same "4 cards + CTA" welcome + the
 * "where to start" dismissible menu can import the same markup
 * without forking the SCSS or the strings.
 *
 * Conventions
 * -----------
 * - Class namespace: `mv-welcome` / `mv-welcome__*` /
 *   `mv-quickstart` / `mv-quickstart__*`. Legacy `welcome__*` /
 *   `quickstart__*` selectors are kept in the companion SCSS via
 *   `@extend`, so the existing dev preview keeps matching during
 *   the deprecation window (a future slice renames the legacy
 *   selectors to `mv-*` and drops the aliases).
 * - `CARDS` is the canonical 4-card explainer used by both
 *   `renderFirstRunScreen` and `renderQuickStartMenu`. The dev
 *   preview's "Welcome" and "Quick start" surfaces differ only
 *   in chrome (heading + CTA) — the card body is identical.
 * - `isQuickStartDismissed` / `dismissQuickStart` are exported
 *   alongside so the host's runtime glue does not need to know
 *   the sessionStorage key. Hosts that want a different key (e.g.
 *   a CLI wizard that persists to disk) can wrap or override
 *   these helpers; the renderers themselves never touch storage.
 */

export interface IWelcomeCard {
	readonly icon: string;
	readonly title: string;
	readonly body: string;
}

export const CARDS: ReadonlyArray<IWelcomeCard> = [
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

const escapeAttr = (s: string): string =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

export const QUICK_START_KEY = 'mv:dev:quickstart-dismissed';

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
		(card) =>
			`<article class="mv-welcome__card welcome__card">
				<div class="mv-welcome__card-icon welcome__card-icon" aria-hidden="true">${escapeAttr(card.icon)}</div>
				<h3>${escapeAttr(card.title)}</h3>
				<p>${escapeAttr(card.body)}</p>
			</article>`,
	).join('');

	return `<section class="mv-welcome welcome" data-first-run="true">
			<header class="mv-welcome__head welcome__head">
				<h1>Welcome to mcp-vertex</h1>
				<p class="mv-welcome__lede welcome__lede">This extension ships a dashboard, settings, and a tools panel for the <code>mcp-vertex</code> MCP server. The MCP server is not installed in this workspace yet — once it is, the dashboard will switch to fetching real data from it.</p>
			</header>
			<div class="mv-welcome__grid welcome__grid">
				${cardsHtml}
			</div>
			<footer class="mv-welcome__cta welcome__cta">
				<button type="button" id="welcome-install" class="mv-welcome__primary welcome__primary" data-action="open-settings">${escapeAttr(installLabel)}</button>
				<button type="button" id="welcome-skip" class="mv-welcome__secondary welcome__secondary" data-action="skip-to-dashboard">Skip — show me the dashboard anyway</button>
			</footer>
		</section>`;
};

export const renderQuickStartMenu = (): string => {
	const itemsHtml = CARDS.map(
		(card) =>
			`<li class="mv-quickstart__item quickstart__item">
				<span class="mv-quickstart__icon quickstart__icon" aria-hidden="true">${escapeAttr(card.icon)}</span>
				<div>
					<strong>${escapeAttr(card.title)}.</strong>
					<span class="mv-quickstart__desc quickstart__desc">${escapeAttr(card.body)}</span>
				</div>
			</li>`,
	).join('');

	return `<aside class="mv-quickstart quickstart" role="complementary">
			<header class="mv-quickstart__head quickstart__head">
				<h2>Quick start</h2>
				<button type="button" id="quickstart-dismiss" class="mv-quickstart__close quickstart__close" aria-label="Dismiss quick start">×</button>
			</header>
			<p class="mv-quickstart__lede quickstart__lede">A one-time orientation. The workspace is wired and the dashboard is now pulling real data — here's what each tab does.</p>
			<ul class="mv-quickstart__list quickstart__list">${itemsHtml}</ul>
		</aside>`;
};
