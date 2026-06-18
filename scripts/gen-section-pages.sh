#!/usr/bin/env bash
# gen-section-pages.sh — generates the per-language section pages for the Astro site.
# Each language gets: {lang}/install.astro, {lang}/tools.astro,
# {lang}/benchmarks.astro and {lang}/plugins/index.astro.
# Run from the repo root.
set -euo pipefail

LANGS="es fr de pt it zh hi ar ja vi th"
SECTION_COMPONENTS=( "install|install.title|Install"
                     "tools|tools.title|ToolsSection"
                     "benchmarks|bench.title|BenchmarksSection" )

for lang in $LANGS; do
  mkdir -p "apps/web/src/pages/$lang/plugins"
  for row in "${SECTION_COMPONENTS[@]}"; do
    section="${row%%|*}"
    rest="${row#*|}"
    title_key="${rest%%|*}"
    component="${rest##*|}"
    cat > "apps/web/src/pages/$lang/$section.astro" <<EOF
---
import Base from '../../layouts/Base.astro';
import ${component} from '../../components/${component}.astro';
import SiteFooter from '../../components/SiteFooter.astro';
import { useTranslations, type Lang } from '../../i18n/ui';

const lang: Lang = '$lang';
const t = useTranslations(lang);
const base = import.meta.env.BASE_URL.replace(/\\/\$/, '');
const repo = 'https://github.com/CartagoGit/mcp-vertex';
const homeHref = \`\${base}/$lang/\`;
---

<Base lang={lang} title={\`\${t('$title_key')} — @mcp-vertex/core\`}>
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
		<${component} lang={lang} />
	</main>
	<SiteFooter lang={lang} />
</Base>
EOF
  done
  cat > "apps/web/src/pages/$lang/plugins/index.astro" <<EOF
---
import Base from '../../../layouts/Base.astro';
import PluginsSection from '../../../components/PluginsSection.astro';
import SiteFooter from '../../../components/SiteFooter.astro';
import { useTranslations, type Lang } from '../../../i18n/ui';

const lang: Lang = '$lang';
const t = useTranslations(lang);
const base = import.meta.env.BASE_URL.replace(/\\/\$/, '');
const repo = 'https://github.com/CartagoGit/mcp-vertex';
const homeHref = \`\${base}/$lang/\`;
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
EOF
done

echo "Generated section pages for: $LANGS"
