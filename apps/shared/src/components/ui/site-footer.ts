/**
 * `apps/shared/src/components/ui/site-footer.ts` — host-agnostic
 * site footer block. Returns the footer markup as a string.
 *
 * Replaces `apps/web/src/components/SiteFooter.astro` (f00102 S3.2).
 * The wrapper Astro resolves `import.meta.env.BASE_URL` and the i18n
 * dictionary; the renderer only sees plain strings so the same HTML
 * works for the marketing site, an extension panel, etc.
 *
 * Conventions
 * -----------
 * - Class namespace: `mv-sitefoot` plus `mv-sitefoot__*` and the
 *   `mv-sitefoot__col--brand` modifier. Legacy `.sitefoot*`
 *   selectors live in the companion SCSS via `@extend` so the
 *   docs site keeps emitting its existing markup without a
 *   rename.
 * - All twelve labels are pre-translated strings (the host
 *   resolves the i18n dictionary). Defaults are English so the
 *   extension can use this without supplying labels.
 * - The repo / creators / npm URLs are hard-coded constants — the
 *   hosting org doesn't change between surfaces. Hosts that want
 *   to override them all together can pass a new set via
 *   `urls`; the default is the mcp-vertex project.
 *
 * The `transition:persist` directive that used to live in
 * SiteFooter.astro is an Astro runtime hint; the shared renderer
 * emits plain markup and the wrapper Astro applies the directive.
 */
import { escapeHtml } from '../../lib/escape';

export interface ISiteFooterLabels {
	readonly tagline: string;
	readonly madeBy: string;
	readonly sections: string;
	readonly resources: string;
	readonly built: string;
	readonly install: string;
	readonly tools: string;
	readonly benchmarks: string;
	readonly plugins: string;
	readonly prompts: string;
	readonly knowledge: string;
	readonly creatorsRepo: string;
	readonly creatorsNpm: string;
}

export interface ISiteFooterUrls {
	readonly repo: string;
	readonly creatorsRepo: string;
	readonly creatorsNpm: string;
	readonly npmPackage: string;
	readonly apiDocs: string;
}

export interface ISiteFooterSection {
	readonly id: string;
	readonly label: string;
	readonly href: string;
}

export interface ISiteFooterProps {
	readonly lang: string;
	readonly baseHref: string;
	readonly year: number;
	readonly labels: Partial<ISiteFooterLabels>;
	readonly urls?: Partial<ISiteFooterUrls>;
	/** Override the default section list (the docs site keeps the canonical 7). */
	readonly sections?: ReadonlyArray<ISiteFooterSection>;
}

const DEFAULT_LABELS: ISiteFooterLabels = {
	tagline: 'A project-agnostic MCP server core + CLI plugin loader.',
	madeBy: 'Crafted by CartagoGit',
	sections: 'Sections',
	resources: 'Resources',
	built: 'Built on Bun · rendered by Astro · audited nightly',
	install: 'Install',
	tools: 'Tools',
	benchmarks: 'Benchmarks',
	plugins: 'Plugins',
	prompts: 'Prompts',
	knowledge: 'Knowledge',
	creatorsRepo: 'CartagoGit · GitHub',
	creatorsNpm: 'CartagoGit · npm',
};

const DEFAULT_URLS: ISiteFooterUrls = {
	repo: 'https://github.com/CartagoGit/mcp-vertex',
	creatorsRepo: 'https://github.com/CartagoGit',
	creatorsNpm: 'https://www.npmjs.com/~cartago-git',
	npmPackage: 'https://www.npmjs.com/package/@mcp-vertex/core',
	apiDocs: 'api/',
};

const DEFAULT_SECTIONS: ReadonlyArray<ISiteFooterSection> = [
	{ id: 'install', label: DEFAULT_LABELS.install, href: '/install' },
	{ id: 'tools', label: DEFAULT_LABELS.tools, href: '/tools' },
	{ id: 'benchmarks', label: DEFAULT_LABELS.benchmarks, href: '/benchmarks' },
	{ id: 'plugins', label: DEFAULT_LABELS.plugins, href: '/plugins' },
	{ id: 'prompts', label: DEFAULT_LABELS.prompts, href: '/prompts' },
	{ id: 'resources', label: DEFAULT_LABELS.resources, href: '/resources' },
	{ id: 'knowledge', label: DEFAULT_LABELS.knowledge, href: '/knowledge' },
];

const resolveHref = (baseHref: string, href: string): string => {
	// The Astro caller passes `baseHref` already localised: `/` for
	// the EN build, `/es/` for the ES build, etc. We just concatenate
	// the clean href (always starts with `/`); the trailing-slash
	// collapse keeps the URL canonical even when callers pass
	// `baseHref = '/'` and `href = '/install'`.
	const cleanHref = href.startsWith('/') ? href : `/${href}`;
	if (baseHref === '/') return cleanHref;
	return `${baseHref.replace(/\/$/, '')}${cleanHref}`;
};

/**
 * Render the site-footer block as a string. The host wraps the
 * result in `<footer class="mv-sitefoot sitefoot" transition:persist>`
 * to keep the structural scope and the Astro view-transition
 * persistence hint.
 *
 * @example
 *   // Astro:
 *   const labels = {
 *     tagline: t.footer.tagline,
 *     madeBy: t.footer.madeBy,
 *     sections: t.footer.sections,
 *     // ...
 *   };
 *   <Fragment set:html={renderSiteFooter({ lang, baseHref, year, labels })} />
 */
export const renderSiteFooter = (props: ISiteFooterProps): string => {
	const lang = props.lang;
	const baseHref = props.baseHref;
	const year = props.year;
	const mergedLabels: ISiteFooterLabels = {
		...DEFAULT_LABELS,
		...props.labels,
	};
	const urls: ISiteFooterUrls = { ...DEFAULT_URLS, ...props.urls };
	const sections = props.sections ?? DEFAULT_SECTIONS;

	const sectionLinks = sections
		.map(
			(s) =>
				`<a data-nav-key="${escapeHtml(s.id)}" href="${escapeHtml(resolveHref(baseHref, s.href))}">${escapeHtml(s.label)}</a>`,
		)
		.join('');

	return [
		`<div class="mv-sitefoot__inner">`,
		`<div class="mv-sitefoot__col mv-sitefoot__col--brand">`,
		`<strong>@mcp-vertex</strong>`,
		`<p data-footer-key="tagline">${escapeHtml(mergedLabels.tagline)}</p>`,
		`<p class="mv-sitefoot__credit" data-footer-key="madeBy">${escapeHtml(mergedLabels.madeBy)}</p>`,
		`</div>`,
		`<nav class="mv-sitefoot__col" aria-label="Sections">`,
		`<strong data-footer-key="sections">${escapeHtml(mergedLabels.sections)}</strong>`,
		sectionLinks,
		`</nav>`,
		`<nav class="mv-sitefoot__col" aria-label="Resources">`,
		`<strong data-footer-key="resources">${escapeHtml(mergedLabels.resources)}</strong>`,
		`<a href="${escapeHtml(`${baseHref}/${urls.apiDocs}`)}">API (TypeDoc)</a>`,
		`<a href="${escapeHtml(urls.repo)}" rel="external">@mcp-vertex · GitHub</a>`,
		`<a href="${escapeHtml(urls.npmPackage)}" rel="external">@mcp-vertex · npm</a>`,
		`<a data-footer-key="creatorsRepo" href="${escapeHtml(urls.creatorsRepo)}" rel="external">${escapeHtml(mergedLabels.creatorsRepo)}</a>`,
		`<a data-footer-key="creatorsNpm" href="${escapeHtml(urls.creatorsNpm)}" rel="external">${escapeHtml(mergedLabels.creatorsNpm)}</a>`,
		`</nav>`,
		`</div>`,
		`<div class="mv-sitefoot__base">`,
		`<span>© ${year} mcp-vertex · BSD-3-Clause · <span data-footer-key="built">${escapeHtml(mergedLabels.built)}</span></span>`,
		`</div>`,
	].join('');
};
