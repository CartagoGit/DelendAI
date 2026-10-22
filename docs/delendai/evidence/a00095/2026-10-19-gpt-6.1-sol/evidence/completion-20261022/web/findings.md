# Web continuation findings

Snapshot: `95841ce85b486112d049a6ad871d1612e4fcfd88`. Auditor: gpt-6.1-sol. Recorded2026-10-22. No product fixes.

## WEB-TABS01 — An old fade callback hides the tab panel that has become active again

P2. Real Chrome on first-5-minutes: start bun-node, click vscode then bun-node in the same task; after400ms active=bun-node but all3panels hidden. A normal keyboard ArrowRight control selects/shows vscode.

Expected: After rapidly selecting A→B→A, A remains visible and aria-selected agrees with visible content.

Cause: Outgoing animationend callbacks and260ms fallback timers unconditionally hide their captured panel; reactivation does not cancel them or check current active id.

Impact: Fast tab changes leave the content area blank while the tab remains selected.

Recommendation: Cancel prior hide callbacks or use an activation generation/current-active guard before hiding.

Limits: Actual unmodified UI built from fixed source with synthetic capabilities and real generated skills/pages. This is Chrome, not every browser.

`apps/web/src/components/ui/_tabs-controller.ts:119`

```
            } else if (wasActive) {
                // Fade the outgoing panel out, then hide it.
                p.classList.remove('is-entering');
                p.classList.add('is-leaving');
                p.addEventListener(
                    'animationend',
                    () => {
                        p.classList.remove('is-leaving');
                        p.setAttribute('hidden', '');
                    },
                    { once: true },
                );
                setTimeout(() => {
                    p.classList.remove('is-leaving');
                    p.setAttribute('hidden', '');
                }, FADE_FALLBACK_MS);
```

## WEB-TABS02 — Tabs and copy buttons stop binding after an Astro client navigation

P2. Real Chrome direct first-5-minutes has bound=1; clicking actual nav home link produces3new roots with bound/active=null. Clicking Python leaves its panel hidden; clicking a copy control leaves bound/state null.

Expected: Controls in each newly swapped main subtree are initialized after client navigation.

Cause: Component module scripts call initTabs/initCopyButtons only once; neither registers astro:page-load, and Astro reuses already executed modules across these transitions.

Impact: Install ecosystem tabs and copy controls become inert when arriving through normal in-site navigation; a hard reload masks the fault.

Recommendation: Initialize the idempotent controllers on astro:page-load as well as initial load, or delegate events at a persistent root.

Limits: The reproduction uses actual first5→home link navigation, no injected app router. Clipboard content itself was not read; unbound/no visual state is observed and tab nonresponse is directly observed.

`apps/web/src/components/ui/Tabs.astro:46`

```
<script>
    /**
     * Tabs controller — keyboard + cross-fade glue. Kept in
     * apps/web/src/components/ui/_tabs-controller.ts because the
     * scope of the controller is per-page (driven by `[data-ui-tabs]`
     * roots in the document) and the script lives alongside the
     * Astro components that produce those roots. The renderer
     * itself is host-agnostic; this site-specific glue is the seam.
     */
    import { initTabs } from './_tabs-controller';
    initTabs(document);
</script>
```

`apps/web/src/components/ui/CodeBlock.astro:47`

```
<script>
    /**
     * Copy-button runtime glue — handled by the controller in
     * apps/web. The shared renderer just emits the markup;
     * this `<script>` wires `data-copy-target` to the matching
     * `<code id>` and toggles `data-state="copied"`. The runtime
     * glue is site-specific because it depends on `navigator.
     * clipboard` and the i18n dictionary of the page.
     */
    import { initCopyButtons } from './_code-copy-controller';
    initCopyButtons(document);
</script>
```

`apps/web/src/components/ui/CopyButton.astro:30`

```
<script>
    import { initCopyButtons } from './_code-copy-controller';
    initCopyButtons(document);
</script>
```

## WEB-SKILL01 — The skills index renders one literal undefined namespace heading

P3. The real skill generator emits28records with plugin, not namespace. Real Chrome /skills renders28cards under one heading whose text is undefined.

Expected: Skill records are adapted to the grid namespace contract, producing meaningful groups.

Cause: An as unknown cast invents a namespace field without constructing it; CapabilityGrid groups by item.namespace.

Impact: Users cannot see meaningful grouping and encounter an internal undefined label.

Recommendation: Use a checked shared manifest type and map namespace from the intended owner field before rendering.

Limits: Cards/links still render; this does not claim missing skills or runtime skill discovery failure. The generator plugin field currently denotes the skill slug, so define intended owner semantics explicitly.

`apps/web/src/components/SkillsSection.astro:22`

```

type ISkill = {
    id: string;
    name: string;
    description: string;
    plugin: string;
    summary: string;
    path: string;
};
const skills = (skillsData.skills ?? []) as unknown as Array<{
    readonly id: string;
    readonly name: string;
    readonly namespace: string;
    readonly description: string;
}>;
```

`apps/web/src/components/SkillsSection.astro:47`

```
        <CapabilityGrid
            kind="skill"
            items={skills}
            labels={{ stat: t.skills.count, empty: t.skills.lead }}
```

`apps/web/src/components/CapabilityGrid.astro:158`

```
const groups: Record<string, AnyItem[]> = {};
for (const item of items) {
    const ns = item.namespace;
    if (!groups[ns]) groups[ns] = [];
    groups[ns].push(item);
}
const namespaces = Object.entries(groups).sort((a, b) =>
    a[0].localeCompare(b[0]),
);
```

`apps/web/src/components/CapabilityGrid.astro:182`

```
            ) : (
                namespaces.map(([ns, list]) => (
                    <div class="ns">
                        <div class="ns__head">
                            <h3>{labels.namespaceTitle ?? ns}</h3>
                            <span class="ns__count">{list.length}</span>
                        </div>
```

`apps/web/scripts/gen-skills.ts:130`

```
            const fm = parseFrontmatter(text);
            const rel = `${anchor}/${relPrefix}${entry}`;
            out.push({
                id: fm.id ?? slugFromPath(rel),
                name: fm.name ?? entry,
                description: fm.description ?? '',
                plugin: slugFromPath(rel),
                summary: firstSentence(
                    text.split(/^---\n[\s\S]*?\n---\n/)[1] ?? '',
                ),
                path: rel,
            });
```

## WEB-TUTORIAL01 — Tutorial translation parity accepts equal counts with different slugs

P2. Calling actual exported runCheck with en/wanted and es/orphan returns parityProblems=[]; same-slug control also returns[]. Existing orphan test only passes because an unrelated locale is missing and bypasses the early continue.

Expected: Every English tutorial slug exists in each supported locale; extra/mismatched slugs are reported independently of counts.

Cause: Parity compares counts, and orphan checking is skipped entirely when counts are sufficient.

Impact: A green translation gate can hide a missing tutorial replaced by an unrelated file.

Recommendation: Compare per-plugin/per-locale slug sets; run missing and orphan checks without a count-only early return.

Limits: Synthetic metadata invokes the unmodified actual function. The real current tutorial tree reports60files; no claim that it currently contains mismatched slugs.

`apps/web/scripts/check-tutorials-i18n.ts:90`

```
    for (const [plugin, pluginEnList] of enByPlugin) {
        const pluginTutorials = tutorials.filter((t) => t.plugin === plugin);
        const missingByLang = langCodes.filter((code) => {
            if (code === 'en') return false;
            const present = pluginTutorials.filter(
                (t) => t.lang === code,
            ).length;
            return present < pluginEnList.length;
        });
        if (missingByLang.length === 0) continue;
        parityProblems.push(
            `[${plugin}] EN=${pluginEnList.length} · missing in: ${missingByLang.join(', ')}`,
        );
        for (const code of langCodes) {
            if (code === 'en') continue;
            const orphans = pluginTutorials
                .filter((t) => t.lang === code)
                .filter((t) => !pluginEnList.some((e) => e.slug === t.slug))
                .map((t) => t.slug);
            if (orphans.length > 0) {
                parityProblems.push(
                    `[${plugin}:${code}] orphan slugs not in EN: ${orphans.join(', ')}`,
                );
            }
        }
```

## WEB-ASSET01 — A failed brand refresh deletes the existing cached logo

P2. The unmodified entrypoint in an owned fixture begins with npm.svg. Injected fetch rejects every call; script reports18failed and removes npm.svg as stale.

Expected: When all sources for a brand fail, preserve its last known logo and report the refresh failure.

Cause: Cleanup considers every configured brand eligible for stale-file removal, rather than only brands successfully refreshed during this run.

Impact: A transient/offline refresh converts existing valid assets into missing images.

Recommendation: Remove alternative extensions only for brands with a successfully validated replacement.

Limits: The fetch function is an explicitly injected offline seam and no HTTP request was made. Only owned fixture assets were deleted.

`apps/web/scripts/fetch-brand-logos.ts:244`

```
        let hit: { body: Uint8Array; kind: ImageKind; bytes: number } | null =
            null;
        for (const url of brand.sources) {
            hit = await fetchUrl(url);
            if (hit) break;
        }
        if (!hit) {
            console.warn(
                `FAILED ${brand.outName} (no source responded with an image)`,
            );
            failed += 1;
            continue;
```

`apps/web/scripts/fetch-brand-logos.ts:281`

```
    // Remove any stale logo file with the same `<base>` but a
    // different extension than what we wrote this run. e.g. if
    // the previous x128 attempt left `github.svg` (from simple-
    // icons) and this run downloaded the real `github.png`,
    // the .svg gets deleted. The `<base>.<ext>` we want is the
    // one in `writtenThisRun`; everything else matching a brand
    // base is stale.
    const wantedBases = new Set(BRANDS.map((b) => b.outName));
    for (const file of await readdir(OUT)) {
        const m = file.match(/^(.+)\.(svg|png|ico)$/);
        if (!m) continue;
        const [, base] = m;
        if (!wantedBases.has(base)) continue;
        if (writtenThisRun.has(file)) continue;
        console.log(`removing stale ${file}`);
        await unlink(join(OUT, file));
    }
```

## WEB-ASSET02 — HTML gateway responses are accepted and written as SVG logos

P2. A fake fetch returning status200 text/html body <!doctype html>... produces18.svg files and0failures; npm.svg contains the HTML response verbatim.

Expected: The downloader accepts an SVG document only when its root element is svg, and rejects an HTML gateway/error page.

Cause: SVG magic validation checks only the first byte0x3c, shared by HTML/XML documents.

Impact: Transient marketing-site/gateway pages become persistent broken logo assets and are reported as successful downloads.

Recommendation: Validate SVG XML/root and allowed content type; preserve prior assets when validation fails.

Limits: Only controlled local responses; no live upstream request or claim of script execution through an img element.

`apps/web/scripts/fetch-brand-logos.ts:57`

```

const MAGIC: Record<ImageKind, ReadonlyArray<number>> = {
    svg: [0x3c], // "<svg" — only check the first byte (always '<')
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ico: [0x00, 0x00, 0x01, 0x00],
};

const sniff = (buf: Uint8Array): ImageKind | null => {
    for (const kind of ['svg', 'png', 'ico'] as const) {
        const sig = MAGIC[kind];
        if (buf.byteLength < sig.length) continue;
        let ok = true;
        for (let i = 0; i < sig.length; i++) {
            if (buf[i] !== sig[i]) {
                ok = false;
                break;
            }
        }
        if (ok) return kind;
    }
    return null;
```

`apps/web/scripts/fetch-brand-logos.ts:97`

```
                // upstream's Content-Encoding.
                Accept: 'image/svg+xml,image/png,image/webp,image/*,*/*;q=0.8',
            },
        });
        if (!res.ok) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength === 0) return null;
        const kind = sniff(buf);
        if (!kind) {
            console.warn(
                `  ${url} → magic bytes ${Array.from(buf.slice(0, 8))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join(' ')}, skipping (likely HTML/gzip redirect)`,
            );
            return null;
        }
        return { body: buf, kind, bytes: buf.byteLength };
    } catch (e) {
```

## WEB-ROUTE01 — Localized home pages link to preset pages that are never emitted

P2. The Spanish home emits /delendai/es/presets. The built317page fixture contains /presets/index.html but no /es/presets/index.html; the fixed tree has no [lang]/presets route and markdown page specs are only install/configuration-center.

Expected: Every home panel link resolves to an emitted route, using an explicit English fallback when localization is unavailable.

Cause: The generic home sectionHref prefixes every non-English locale, while presets exists only as an English static route.

Impact: Users following the preset comparison from localized home reach a404.

Recommendation: Add the localized route or link intentionally English-only destinations to the English route with an explicit notice.

Limits: Route absence is independent of synthetic capability counts. Other deliberately English-only guide bodies have explicit notices and are not treated as this defect.

`apps/web/src/components/HomeAtAGlanceSection.astro:21`

```
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const sectionHref = (section: string) =>
    lang === 'en' ? `${base}/${section}` : `${base}/${lang}/${section}`;
```

`apps/web/src/components/HomeAtAGlanceSection.astro:53`

```
                        <p class="at-a-glance__summary">{p.summary}</p>
                        <p class="at-a-glance__cta">
                            <a href={sectionHref(p.href)}>
                                {t.homeAtAGlance.openSection} {p.label} →
                            </a>
```

`apps/web/src/pages/presets.astro:10`

```

const lang: Lang = 'en';
const t = useTranslations(lang);
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const homeHref = `${base}/`;
const matrix = buildPresetMatrix();
```

## WEB-A11Y01 — Opening settings by keyboard leaves focus behind the modal

P2. Real Chrome: focus cfg-open and send native Enter key. Modal opens, focusInsideDialog=false; native Tab moves to background vscode tab, still focusInsideDialog=false.

Expected: Opening an aria-modal dialog moves focus inside it, traps Tab/Shift-Tab, and restores opener focus on close.

Cause: The open callback changes visibility/classes but never focuses dialog content or makes the background inert; the key handler handles only Escape.

Impact: Keyboard/screen-reader users remain in background controls while a modal is visually blocking the page.

Recommendation: Implement dialog focus entry/containment/restore with native dialog or a shared tested focus manager.

Limits: Settings modal is directly tested. Search/drawer source has related omissions but this finding does not claim an executed test for each of them; no assistive-technology session was run.

`apps/web/src/components/Config.astro:79`

```
<div class="modal" id="cfg-modal" role="dialog" aria-modal="true" aria-label={t.cfg.title} hidden transition:persist>
    <div class="modal__backdrop" data-cfg-close></div>
    <div class="modal__panel">
        <div class="modal__head">
            <h2>{t.cfg.title}</h2>
            <button class="modal__close" data-cfg-close aria-label={t.cfg.close}>×</button>
```

`apps/web/src/components/Config.astro:169`

```
        const modal = document.getElementById('cfg-modal');
        const openBtn = document.getElementById('cfg-open');
        const motion = document.getElementById('cfg-motion') as HTMLInputElement | null;

        const open = () => {
            modal?.removeAttribute('hidden');
            modal?.classList.add('modal--open');
            if (motion) motion.checked = readMotion() !== 'reduced';
            markActiveTheme();
            markActiveLang();
        };
```

`apps/web/src/components/Config.astro:191`

```
        openBtn?.addEventListener('click', open, { signal });
        for (const el of document.querySelectorAll('[data-cfg-close]')) {
            el.addEventListener('click', close, { signal });
        }
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape') close();
            },
            { signal }
        );
```

## WEB-CSS01 — The More dropdown uses a class prefix that its stylesheet never styles

P3. Real Chrome390px: nav__more remains display:block and its trigger inline-block/native-looking, while .nav__link is none and hamburger grid. Rendered classes are nav__more__trigger/menu/item; stylesheet/breakpoint target nav-more equivalents.

Expected: The nav dropdown markup uses the same BEM prefix as its styles and hides along with desktop links below the mobile breakpoint.

Cause: SiteNav passes classPrefix=nav__more instead of nav-more.

Impact: The More menu loses the designed presentation and remains an extra desktop control on mobile.

Recommendation: Use the established nav-more prefix or update all styles/breakpoint selectors together and test rendered markup.

Limits: Dropdown still toggles via the shared runtime. This is a styling/responsive mismatch, not proof of failed navigation; broken Spanish hrefs are separately G134.

`apps/web/src/components/SiteNav.astro:104`

```
            <Fragment set:html={renderDropdown({
                id: 'nav-more',
                idPrefix: 'nav-more',
                classPrefix: 'nav__more',
                label: t.nav.more,
                align: 'right',
                items: navCore.map((l) => ({
                    id: l.key,
                    label: l.label,
                    href: l.href,
                })),
            })} />
```

`apps/web/src/styles/components/_nav.scss:143`

```
.nav-more {
    position: relative;

    --nav-more-trigger-bg: transparent;
    --nav-more-trigger-color: var(--muted);
    --nav-more-caret-transform: none;
}
.nav-more__trigger {
    list-style: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--nav-more-trigger-color);
```

`apps/web/src/styles/components/_nav-media.scss:18`

```
    }

    .nav__link,
    .nav__divider,
    .nav-more,
    .nav__github {
        display: none;
    }

    .hamburger {
        display: inline-grid;
    }
```

## WEB-GATE01 — The strict web build invokes the translation checker in warn-only mode

P2. A local in-memory fixture deletes es.nav.tools and imports the actual checker using the same no-flag argv as build:strict: exit0, missing-key warning, then an i18n complete success line. Adding --strict to the same owned fixture exits1.

Expected: A missing required site translation makes build:strict fail before publication.

Cause: build:strict omits the checker --strict argument; resolveCheckMode defaults to warn, so the gate explicitly continues after missing keys.

Impact: A build named strict can succeed with required translation keys absent, and emits a contradictory completeness message.

Recommendation: Pass --strict from the strict build and test the actual command wiring, preserving a separately named warn-only development mode if wanted.

Limits: Only an in-memory dictionary object in a disposable child process is changed. No product source is edited and the real current dictionaries passed a separate strict check. This demonstrates gate behavior, not an existing missing nav.tools translation.

`apps/web/package.json:19`

```
        "gen:skills": "bun scripts/gen-skills.ts",
        "gen:logos": "bun scripts/gen-plugin-logos.ts",
        "fetch:logos": "bun scripts/fetch-brand-logos.ts",
        "index:search": "pagefind --site ../../build/apps/web",
        "build": "bun scripts/check-i18n.ts && bun run sync:public-api && bun run gen:manifests && bun scripts/gen-plugin-logos.ts && astro build && bun run index:search",
        "build:strict": "bun scripts/check-i18n.ts && bun run lint:web:jsx-literals && bun run sync:public-api && bun run gen:manifests:strict && bun scripts/gen-plugin-logos.ts && astro build && bun run index:search"
    },
    "dependencies": {
```

`apps/web/scripts/check-i18n.ts:31`

```
export type CheckMode = 'warn' | 'strict';

export const resolveCheckMode = (argv: readonly string[]): CheckMode =>
    argv.includes('--strict') ? 'strict' : 'warn';

const strictMode = resolveCheckMode(process.argv) === 'strict';
```

`apps/web/scripts/check-i18n.ts:215`

```
}

if (problems.length) {
    console.error(
        '\u2717 i18n incomplete \u2014 every language must translate every key:\n',
    );
    for (const p of problems) console.error(`  ${p}`);
    console.error(
        `\n${languages.length} languages \u00b7 ${enKeys.length} keys each expected.`,
    );
    if (strictMode) process.exit(1);
    console.warn(
        `\n\u26a0 warn-only mode (f00059 S2): pass --strict to fail the build.`,
    );
}

console.log(
    `\u2713 i18n complete: ${languages.length} languages \u00d7 ${enKeys.length} keys.`,
);

```
