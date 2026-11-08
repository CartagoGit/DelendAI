/**
 * style-sources.service.ts — what a stylesheet defines and what markup
 * uses, read one way.
 *
 * The integrity ratchet (`lint:style-integrity`) and the selector graph
 * both ask these two questions. Asked by two parsers they would sooner or
 * later disagree about what a stylesheet defines — nesting expansion,
 * comma lists, interpolations — and each would be right by its own
 * reading. This is the one reading; the ratchet imports it.
 */
import type {
	IAstroParts,
	IUsedClass,
} from '../contracts/interfaces/style-sources.interface';

/** A usable class token — anything else in a class attribute is skipped. */
const CLASS_TOKEN = /^[a-zA-Z][\w-]*$/;

/** `.class` tokens inside a resolved selector string. */
const SELECTOR_CLASS = /\.([a-zA-Z][\w-]*)/g;

/** Static `class="…"` / `class='…'` attributes (dynamic `{…}` never matches). */
const CLASS_ATTR = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const FRONTMATTER = /^﻿?---\r?\n[\s\S]*?\r?\n---/;
// `</style >` and `</script\n>` are valid closing tags — HTML allows
// whitespace before the `>`. A pattern that demands `</script>` exactly
// stops stripping at the first tag written that way and treats
// everything after it as markup (`js/bad-tag-filter`).
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi;

/**
 * At-rules whose body starts a fresh selector context (their inner
 * selectors are still collected as definitions — a `.foo` inside a mixin
 * gets included somewhere, and being permissive on DEFINED only avoids
 * false failures). Everything else (`@media`, `@supports`, `@each`, …)
 * is transparent: the parent selector stack flows through.
 */
const OPAQUE_AT_RULES = new Set([
	'font-face',
	'function',
	'keyframes',
	'mixin',
	'page',
	'property',
]);

/** Selector-context cartesian cap — keeps pathological nesting bounded. */
const MAX_CONTEXT = 512;

/** Splice point left where a `#{…}` interpolation sat in a selector. */
const INTERPOLATION_MARK = '\u0000';

const blankPreservingLines = (text: string): string =>
	text.replace(/[^\n]/g, ' ');

const lineOf = (text: string, index: number): number => {
	let line = 1;
	for (let i = 0; i < index && i < text.length; i++) {
		if (text[i] === '\n') line++;
	}
	return line;
};

/** Split a selector prelude on top-level commas (parens/brackets safe). */
export const splitSelectorList = (prelude: string): readonly string[] => {
	const out: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of prelude) {
		if (ch === '(' || ch === '[') depth++;
		else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			if (current.trim().length > 0) out.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	if (current.trim().length > 0) out.push(current.trim());
	return out;
};

/**
 * Resolve a child selector list against the parent context: `&` splices
 * the parent in place (this is what expands `&__x`/`&--x`/`&-x` into the
 * full class name); anything else nests as a descendant.
 */
const resolveSelectors = (
	parents: readonly string[],
	children: readonly string[],
): readonly string[] => {
	const out: string[] = [];
	for (const child of children) {
		const bases = parents.length > 0 ? parents : [''];
		for (const base of bases) {
			if (out.length >= MAX_CONTEXT) return out;
			out.push(
				child.includes('&')
					? child.replaceAll('&', base)
					: `${base} ${child}`.trim(),
			);
		}
	}
	return out;
};

/**
 * Brace-context scss/css parser: walks a stylesheet, expands nesting,
 * and returns every plain `.class` token the sheet defines. Handles
 * comments, strings, and `#{…}` interpolation (interpolated fragments
 * never produce class tokens across the splice point).
 */
export const extractDefinedClasses = (scss: string): ReadonlySet<string> => {
	const defined = new Set<string>();
	const stack: (readonly string[])[] = [];
	let buf = '';
	let i = 0;
	const n = scss.length;
	while (i < n) {
		const ch = scss[i];
		const next = scss[i + 1];
		if (ch === '/' && next === '*') {
			const end = scss.indexOf('*/', i + 2);
			i = end === -1 ? n : end + 2;
			continue;
		}
		if (ch === '/' && next === '/') {
			const end = scss.indexOf('\n', i + 2);
			i = end === -1 ? n : end;
			continue;
		}
		if (ch === '"' || ch === "'") {
			const quote = ch;
			buf += ch;
			i++;
			while (i < n) {
				const c = scss[i];
				buf += c;
				if (c === '\\') {
					buf += scss[i + 1] ?? '';
					i += 2;
					continue;
				}
				i++;
				if (c === quote) break;
			}
			continue;
		}
		if (ch === '#' && next === '{') {
			let depth = 1;
			let j = i + 2;
			while (j < n && depth > 0) {
				if (scss[j] === '{') depth++;
				else if (scss[j] === '}') depth--;
				j++;
			}
			// Placeholder that no class token can span — `.x-#{$y}` must
			// not define `x-` + whatever follows the interpolation.
			buf += INTERPOLATION_MARK;
			i = j;
			continue;
		}
		if (ch === '{') {
			const prelude = buf.trim();
			buf = '';
			i++;
			if (prelude.startsWith('@')) {
				const name = /^@([a-zA-Z-]+)/.exec(prelude)?.[1] ?? '';
				stack.push(
					OPAQUE_AT_RULES.has(name) ? [] : (stack.at(-1) ?? []),
				);
				continue;
			}
			const resolved = resolveSelectors(
				stack.at(-1) ?? [],
				splitSelectorList(prelude),
			);
			for (const selector of resolved) {
				for (const match of selector.matchAll(SELECTOR_CLASS)) {
					const token = match[1];
					// `.icon-#{$name}` defines dynamic classes we cannot
					// know statically — never record the literal prefix.
					const after = selector[match.index + match[0].length];
					if (token !== undefined && after !== INTERPOLATION_MARK) {
						defined.add(token);
					}
				}
			}
			stack.push(resolved);
			continue;
		}
		if (ch === '}') {
			stack.pop();
			buf = '';
			i++;
			continue;
		}
		if (ch === ';') {
			buf = '';
			i++;
			continue;
		}
		buf += ch;
		i++;
	}
	return defined;
};

export const parseAstro = (text: string): IAstroParts => {
	const styleBlocks: string[] = [];
	let markup = text.replace(FRONTMATTER, blankPreservingLines);
	markup = markup.replace(STYLE_BLOCK, (whole, css: string) => {
		styleBlocks.push(css);
		return blankPreservingLines(whole);
	});
	markup = markup.replace(SCRIPT_BLOCK, blankPreservingLines);
	return { markup, styleBlocks };
};

/** Class tokens used by static `class="…"` attributes in blanked markup. */
export const extractUsedClasses = (markup: string): readonly IUsedClass[] => {
	const out: IUsedClass[] = [];
	for (const match of markup.matchAll(CLASS_ATTR)) {
		const value = match[1] ?? match[2] ?? '';
		const line = lineOf(markup, match.index);
		for (const token of value.split(/\s+/)) {
			if (CLASS_TOKEN.test(token)) out.push({ className: token, line });
		}
	}
	return out;
};
