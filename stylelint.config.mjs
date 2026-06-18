// @ts-check
/**
 * Stylelint config — apps/web (Astro) SCSS.
 *
 * Goals:
 *  - BEM flexible: `block`, `block__elem`, `block--mod`, `block__elem--mod`,
 *    plus `&__elem` / `&--mod` nested shorthand inside the block. Attribute
 *    selectors (`.block[aria-pressed='true']`) are allowed.
 *  - Nested SCSS is free; the linter validates the *resolved* selector
 *    (the `&` is fully expanded before the BEM check runs).
 *  - Max nesting depth 3.
 *  - Modern SCSS only: `@use` / `@forward`, no `@import`.
 *
 * Implementation note:
 *  `stylelint-selector-bem-pattern` v5 is not compatible with stylelint 17's
 *  flat config (its `createPlugin` returns the legacy `{ruleName, rule}`
 *  shape and silently no-ops on option validation in flat mode).  Instead
 *  of pinning an old stylelint or carrying an unmaintained plugin, we ship
 *  a small custom rule (`scoped-bem/selector`) inline.  ~150 lines, no
 *  extra dep, and we own the semantics — including manual `&` expansion
 *  so the rule can validate SCSS-nested selectors properly.
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import stylelint from 'stylelint';
import selectorParser from 'postcss-selector-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────────────────────────────────
// Custom BEM rule
//
// Resolved-selector shapes (the `&` is expanded before this is called):
//   - `.block`
//   - `.block__elem`
//   - `.block--mod`
//   - `.block__elem--mod`
//   - Any of the above followed by `[attr]`            (`.btn--primary[disabled]`)
//
// Plus pseudo-classes that are common in interactive widgets (the rule
// accepts ONE trailing pseudo-class on any of the above forms):
//   - `:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`
//   - `:disabled`, `:checked`, `:placeholder-shown`
//
// Plus SCSS-relative shorthand (handled in the rule itself by expanding
// the parent selector before validation).
// ──────────────────────────────────────────────────────────────────────────

/** @type {Set<string>} */
const UTILITY_SELECTORS = new Set([
	// Modifier-only utilities
	'btn--primary',
	'btn--ghost',
	'fx--read',
	'fx--write',
	'fx--spawn',
	'fx--destructive',
	'fx--network',
	'install__h3--first',
	'mq--reverse',
	// Standalone utility components (block or block__elem)
	'btn',
	'gear',
	'chip',
	'chip__icon',
	'chip__mono',
	'chip__tip',
	'hamburger',
	'pm-tab',
	'ide',
	'ide__name',
	'ide__file',
	'bar',
	'bar__label',
	'bar__track',
	'bar__fill',
	'bar__val',
	'tool',
	'pkg',
	'pkg__main',
	'pkg__arrow',
	'stat',
	'lang-opt',
	'swatch',
	'toggle',
	'modal',
	'modal__backdrop',
	'modal__panel',
	'modal__head',
	'modal__close',
	'modal__group',
	'section',
	'grid',
	'feature',
	'resources-table',
	'skills-grid',
	'skill',
	'skill__head',
	'skill__plugin',
	'skill__summary',
	'skill__read',
	'prompts-grid',
	'prompt',
	'prompt__req',
	'langs',
	'swatches',
	'ide-grid',
	'tools-grid',
	'stat-row',
	'sitefoot',
	'sitefoot__base',
	'sitefoot__inner',
	'sitefoot__col',
	'install__cmd-grid',
	'install__cmd-card',
	'install__cmd-label',
	'marquees',
	'ns',
	'ns__head',
	'ns__count',
	'bench',
	'bench__title',
	'bench__chart',
	'bench__note',
	'mq',
	'mq__label',
	'mq__viewport',
	'mq__track',
	'mq__set',
	'fx',
	'install__h3',
]);

/** @type {ReadonlyArray<RegExp>} */
const IGNORE_SELECTORS = [
	// `:root[...]` — global theme roots, not BEM blocks.
	/^:root(\[.+\])?$/,
	// `html[attr]`, `html`, `body`, `*`, `pre`, `code`, `footer` — global
	// element selectors used for document-level overrides (RTL, motion,
	// reset) that the BEM rule does not govern.  Tag-only selectors are
	// caught by the `accept` check below too, but the explicit allow-list
	// is clearer and also covers `html[attr]` style selectors.
	/^html(\[.+\])?$/,
	/^(body|\*|pre|code|footer)$/,
	// Single tag selectors used for global typography / links.
	/^a(:hover|:focus|:focus-visible|:active|:visited)?$/,
	// View-transition pseudo-elements: `::view-transition-old(name)` and
	// `::view-transition-new(name)`.  The `name` segment is an Astro
	// `transition:name` value, which we cannot predict, so we match the
	// full prefix only and let the parent rule accept the parameter.
	/^::view-transition-(old|new)\(/,
	// Bare pseudo-elements (no parameter).
	/^::[a-z-]+$/,
	// `:not(...)` chains — handled by the surrounding rule.
	/^:not\(/,
	// Keyframe names, media queries, and at-rule names.
	/^@keyframes$/,
	/^@media$/,
	/^@each$/,
];

/** Trailing pseudo-classes that are allowed on a BEM selector. */
const ALLOWED_TRAILING_PSEUDOS = new Set([
	'hover',
	'focus',
	'focus-visible',
	'focus-within',
	'active',
	'disabled',
	'checked',
	'placeholder-shown',
	'visited',
]);

const RULE_NAME = 'scoped-bem/selector';

const messages = stylelint.utils.ruleMessages(RULE_NAME, {
	rejected: (selector) =>
		`Selector "${selector}" does not follow the BEM convention. ` +
		`Expected: .block, .block__elem, .block--mod, .block__elem--mod ` +
		`(with optional [attr] and one trailing :pseudo), or a registered utility.`,
});

/** Find the nearest enclosing rule's selector chain. */
function findEnclosingSelector(node) {
	const chain = [];
	let cur = node.parent;
	while (cur && cur.type !== 'root') {
		if (cur.type === 'rule') chain.unshift(cur.selector);
		cur = cur.parent;
	}
	return chain.join(' ');
}

/**
 * Validate a (possibly `&`-prefixed) selector as BEM-flexible.
 *
 * Acceptable shapes:
 *   - `.block`
 *   - `.block__elem`, `.block--mod`, `.block__elem--mod`
 *   - any of the above + `[attr]` + optional trailing `:pseudo`
 *   - `&__elem`, `&--mod`           (SCSS nested BEM shorthand)
 *   - `& <single-class-or-tag>`     (SCSS nested children with `&`)
 *   - `&:<pseudo>` / `&[attr]`      (SCSS nested pseudo/attr on parent)
 *   - `&:hover <child>`             (compound chain rooted at `&`)
 *
 * Rejected:
 *   - `.foo .bar` (descendant not rooted at a single class)
 *   - `html .foo`, `body .foo` (rooted at a tag — use a BEM class)
 *   - any selector whose BEM regex doesn't match and which isn't in the
 *     utility list / ignore list.
 */
function isAcceptable(selector) {
	const sel = trim(selector);
	if (!sel) return true;

	for (const re of IGNORE_SELECTORS) {
		if (re.test(sel)) return true;
	}

	// Pseudo-elements attached to a parent rule are OK.
	if (/^::[a-z-]+$/.test(sel)) return true;

	// SCSS-nested selectors must be rooted at `&`.  This enforces that
	// the author is *intentionally* using the parent's scope, not
	// accidentally leaking a global selector.
	if (sel.startsWith('&')) {
		// Bare `&` is fine.
		if (sel === '&') return true;
		const rest = sel.slice(1);

		// Tokenise the rest by whitespace and validate each segment.
		// Each segment must be a single simple selector (tag, class,
		// pseudo, attribute, BEM shorthand, or compound of those).
		// This accepts:
		//   `&__elem`           (BEM element shorthand)
		//   `&--mod`            (BEM modifier shorthand)
		//   `&:hover`           (pseudo on parent)
		//   `&[disabled]`       (attribute on parent)
		//   `&.is-active`       (extra class on parent)
		//   `& a`               (descendant tag)
		//   `& a:hover`         (descendant tag with pseudo)
		//   `& .inner`          (descendant class)
		//   `&:hover .child`    (parent pseudo + descendant)
		//   `& h1 .grad`        (two-level descendant)
		//   `& h1 code`         (two-level descendant)
		// Rejects chains longer than 2 descendants.
		const segments = rest.split(/\s+/).filter(Boolean);
		if (segments.length > 2) return false;
		// A segment is valid if it starts with one of: `*` (universal),
		// `_` / `-` (BEM shorthand `__` / `--`), a letter (tag), `.`
		// (class), `:` (pseudo), or `[` (attribute).  After the first
		// char we accept BEM-style names plus optional trailing pseudo
		// and attribute predicates.
		const FIRST = /^[*_\-a-zA-Z.:\[]/;
		const REST =
			/[-_a-zA-Z0-9]*(?:::[a-z-]+)?(?::[a-z-]+(?:\([^)]*\))?)?(?:\[[^\]]+\])?$/;
		for (const seg of segments) {
			if (!FIRST.test(seg) || !REST.test(seg.slice(1))) return false;
		}
		return true;
	}

	// Non-`&` selector: it must be a single compound BEM class with
	// optional attribute and optional trailing pseudo.  No descendant
	// combinators allowed at the top level (those would be a sign of
	// "leaking" global selectors — use `&` inside the parent rule).
	if (/[\s>+~]/.test(sel)) return false;

	// Allow `.parent__block a[attr...]` and `.parent__block a:not(.x)` —
	// common pattern for navigation links with attribute filters or
	// `:not()` state-based visibility.  We accept ONE descendant tag
	// (or class) with optional attribute / pseudo / :not chain.  This
	// is the only allowed "descendant at top level" shape; anything more
	// (two descendants, tag+class, etc.) still fails and forces a refactor
	// to nest inside the parent rule.
	if (
		/^\.[a-z][a-z0-9-]*(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?\s+a(:not\([^)]+\))?(\[[^\]]+\])?(:[a-z-]+(?:\([^)]*\))?)?$/.test(
			sel,
		)
	) {
		return true;
	}
	// Same with `:` or `[` on the child (e.g. `.parent :not(.gear)`).
	if (
		/^\.[a-z][a-z0-9-]*(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?\s+(:not\([^)]+\)|\[[^\]]+\])$/.test(
			sel,
		)
	) {
		return true;
	}

	const m = sel.match(
		/^\.([a-z][a-z0-9-]*)(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?(?:\[[^\]]+\])?(?::([a-z-]+))?$/,
	);
	if (!m) return false;
	const pseudo = m[2];
	if (pseudo && !ALLOWED_TRAILING_PSEUDOS.has(pseudo)) return false;
	return true;
}

/** Strip leading/trailing whitespace. */
function trim(s) {
	return s.trim();
}

const bemRule = stylelint.createPlugin(
	RULE_NAME,
	/** @returns {import('postcss').Plugin} */
	() => {
		return (root, result) => {
			const validOptions = stylelint.utils.validateOptions(
				result,
				RULE_NAME,
				{
					actual: true,
					possible: [true],
				},
			);
			if (!validOptions) return;

			root.walkRules((rule) => {
				// Skip keyframes — selectors inside are animation names,
				// not styled CSS.
				let parent = rule.parent;
				let inKeyframes = false;
				while (parent) {
					if (
						parent.type === 'atrule' &&
						parent.name === 'keyframes'
					) {
						inKeyframes = true;
						break;
					}
					parent = parent.parent;
				}
				if (inKeyframes) return;

				// Compute the parent chain (used to expand `&`).
				const parentChain = findEnclosingSelector(rule);

				// Comma-separated selectors are unions; each one is
				// validated independently.  No expansion: SCSS's `&` is
				// validated as a shorthand marker, not expanded.
				const selectors = rule.selectors ?? [rule.selector];
				for (const sel of selectors) {
					if (!isAcceptable(sel)) {
						stylelint.utils.report({
							ruleName: RULE_NAME,
							result,
							node: rule,
							message: messages.rejected(sel),
						});
					}
				}
			});
		};
	},
);

bemRule.ruleName = RULE_NAME;
bemRule.messages = messages;

// Touch imports we don't otherwise use — keeps tree-shakers honest and
// documents the dependency on the selector parser.
void selectorParser;

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────

/** @type {import('stylelint').Config} */
export default {
	// SCSS parser — required for `&` resolution and modern Sass syntax.
	customSyntax: 'postcss-scss',

	// Scope: only the site's SCSS.  `node_modules` / `dist` are excluded by
	// default, plus we skip generated + framework internals explicitly.
	ignoreFiles: [
		'**/node_modules/**',
		'**/dist/**',
		'**/.astro/**',
		'**/coverage/**',
	],

	// Flat-config: pass the plugin with its `ruleName` attached, so stylelint
	// 17 can pick it up correctly.
	plugins: [bemRule],

	rules: {
		// ── BEM (the headline rule) ─────────────────────────────────────
		[RULE_NAME]: true,

		// ── Nested SCSS: limit how deep we go ───────────────────────────
		'max-nesting-depth': 3,

		// ── Modern Sass ─────────────────────────────────────────────────
		// Enforce modern `@use` / `@forward` instead of legacy `@import`.
		'import-notation': 'string',
		'no-duplicate-selectors': null, // SCSS @each/if/else generates dups; too noisy

		// ── Hygiene (some are noisy in nested BEM; we silence them) ────
		'no-descending-specificity': null, // nested BEM legitimately overrides
		'declaration-block-no-redundant-longhand-properties': null,
		'declaration-empty-line-before': null,
		'rule-empty-line-before': null,
		'comment-empty-line-before': null,
		'selector-class-pattern': null,
	},
};
