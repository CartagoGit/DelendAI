#!/usr/bin/env bun
/**
 * gen-section-pages.script.ts — f124 s2 (port of scripts/gen-section-pages.sh).
 *
 * Generates the per-language section pages for the Astro site.
 * Each language gets: {lang}/install.astro, {lang}/tools.astro,
 * {lang}/benchmarks.astro and {lang}/plugins/index.astro.
 * Run from the repo root.
 *
 * Usage: bun tools/scripts/astro/gen-section-pages.script.ts
 *
 * Note: this is a developer-only codegen script. It writes the exact same
 * 4 files per language that the bash heredoc did, with tabs for indent and
 * the same component / import shape, so the diff against the existing
 * files in apps/web/src/pages/<lang>/ is just whitespace and reflow at
 * most. Re-running is safe (it overwrites the generated files only).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

const LANGS = [
	'es',
	'fr',
	'de',
	'pt',
	'it',
	'zh',
	'hi',
	'ar',
	'ja',
	'vi',
	'th',
];

const SECTION_COMPONENTS: ReadonlyArray<{
	readonly section: string;
	readonly titleKey: string;
	readonly component: string;
}> = [
	{ section: 'install', titleKey: 'install.title', component: 'Install' },
	{ section: 'tools', titleKey: 'tools.title', component: 'ToolsSection' },
	{
		section: 'benchmarks',
		titleKey: 'bench.title',
		component: 'BenchmarksSection',
	},
];

const sectionPageTemplate = (params: {
	readonly lang: string;
	readonly titleKey: string;
	readonly component: string;
}): string => `---
import Base from '../../layouts/Base.astro';
import ${params.component} from '../../components/${params.component}.astro';
import SiteFooter from '../../components/SiteFooter.astro';
import { useTranslations, type Lang } from '../../i18n/ui';

const lang: Lang = '${params.lang}';
const t = useTranslations(lang);
const base = import.meta.env.BASE_URL.replace(/\\/$/, '');
const repo = 'https://github.com/CartagoGit/mcp-vertex';
const homeHref = \`\${base}/${params.lang}/\`;
---

<Base lang={lang} title={\`\${t('${params.titleKey}')} — @mcp-vertex/core\`}>
	<nav class="nav">
		<div class="container nav__inner">
			<a class="nav__brand" href={homeHref}>
				<img class="nav__logo" src={\`\${base}/logo.svg\`} width="26" height="26" alt="" />
				@mcp-vertex/core
			</a>
			<div class="nav__links">
				<a href={homeHref}>← {t('nav.concept')}</a>
				<a href={\`\${base}/api/\`}>API</a>
				<a href={repo}>{t('nav.github')}</a>
			</div>
		</div>
	</nav>
	<main>
		<${params.component} lang={lang} />
	</main>
	<SiteFooter lang={lang} />
</Base>
`;

const pluginsIndexTemplate = (params: { readonly lang: string }): string => `---
import Base from '../../../layouts/Base.astro';
import PluginsSection from '../../../components/PluginsSection.astro';
import SiteFooter from '../../../components/SiteFooter.astro';
import { useTranslations, type Lang } from '../../../i18n/ui';

const lang: Lang = '${params.lang}';
const t = useTranslations(lang);
const base = import.meta.env.BASE_URL.replace(/\\/$/, '');
const repo = 'https://github.com/CartagoGit/mcp-vertex';
const homeHref = \`\${base}/${params.lang}/\`;
---

<Base lang={lang} title={\`\${t('plugins.title')} — @mcp-vertex/core\`}>
	<nav class="nav">
		<div class="container nav__inner">
			<a class="nav__brand" href={homeHref}>
				<img class="nav__logo" src={\`\${base}/logo.svg\`} width="26" height="26" alt="" />
				@mcp-vertex/core
			</a>
			<div class="nav__links">
				<a href={homeHref}>← {t('nav.concept')}</a>
				<a href={\`\${base}/api/\`}>API</a>
				<a href={repo}>{t('nav.github')}</a>
			</div>
		</div>
	</nav>
	<main>
		<PluginsSection lang={lang} />
	</main>
	<SiteFooter lang={lang} />
</Base>
`;

const main = async (): Promise<number> => {
	for (const lang of LANGS) {
		const pagesDir = join(REPO_ROOT, 'apps', 'web', 'src', 'pages', lang);
		const pluginsDir = join(pagesDir, 'plugins');
		await mkdir(pluginsDir, { recursive: true });
		for (const row of SECTION_COMPONENTS) {
			await writeFile(
				join(pagesDir, `${row.section}.astro`),
				sectionPageTemplate({
					lang,
					titleKey: row.titleKey,
					component: row.component,
				}),
			);
		}
		await writeFile(
			join(pluginsDir, 'index.astro'),
			pluginsIndexTemplate({ lang }),
		);
	}
	console.log(`Generated section pages for: ${LANGS.join(' ')}`);
	return 0;
};

process.exit(await main());
