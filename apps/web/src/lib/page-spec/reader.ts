import type { Lang } from '#I18N/ui';
import { languageCodes } from '#I18N/shared';
import { z, type ZodError } from 'zod';

import type { IPageFrontmatter, IPageTranslation, PageSpec } from './types';

export interface IReadPagesOptions {
	readonly pagesRoot: string;
	readonly readFile: (relPath: string) => Promise<string | undefined>;
	readonly listDirs?: (relPath: string) => Promise<readonly string[]>;
}

export interface IReadPagesResult {
	readonly pages: readonly PageSpec[];
	readonly errors: readonly IPageSpecError[];
}

export interface IPageSpecError {
	readonly slug: string;
	readonly lang?: Lang;
	readonly code:
		| 'missing-en'
		| 'missing-translation'
		| 'frontmatter-invalid'
		| 'frontmatter-unknown-keys'
		| 'frontmatter-mismatch';
	readonly message: string;
}

interface IParsedTranslation {
	readonly slug: string;
	readonly lang: Lang;
	readonly frontmatter: IPageFrontmatter;
	readonly body: string;
	readonly canonicalKeys: ReadonlySet<keyof IPageFrontmatter>;
	readonly advertisedTranslations: readonly Lang[];
}

interface IRawFrontmatter {
	readonly title: string;
	readonly description: string;
	readonly order?: number;
	readonly navLabel?: string;
	readonly ogImage?: string;
	readonly noindex?: boolean;
	readonly translations?: readonly Lang[];
}

const LANG_SET = new Set<Lang>(languageCodes);
const ALL_LANGS = [...languageCodes] as readonly Lang[];

const rawFrontmatterSchema = z
	.object({
		title: z.string(),
		description: z.string(),
		order: z.number().int().optional(),
		navLabel: z.string().optional(),
		ogImage: z.string().optional(),
		noindex: z.boolean().optional(),
		translations: z
			.array(z.string())
			.optional()
			.superRefine((value, ctx) => {
				if (value === undefined) return;
				for (const lang of value) {
					if (!isLang(lang)) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: `Unknown language code: ${lang}`,
						});
					}
				}
			}),
	})
	.strict();

const MARKDOWN_FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u;

/**
 * `apps/web/package.json` does not declare `js-yaml` or `yaml`, so this slice
 * uses a tiny frontmatter parser for the subset we accept here: scalar values
 * plus a top-level `translations` string array.
 */
export const readPages = async (
	options: IReadPagesOptions,
): Promise<IReadPagesResult> => {
	if (!options.listDirs) {
		return { pages: [], errors: [] };
	}

	const pages: PageSpec[] = [];
	const errors: IPageSpecError[] = [];
	const slugs = await options.listDirs(options.pagesRoot);

	for (const slug of slugs) {
		const slugResult = await readPageSlug(options, slug);
		errors.push(...slugResult.errors);
		if (slugResult.page) {
			pages.push(slugResult.page);
		}
	}

	return { pages, errors };
};

const readPageSlug = async (
	options: IReadPagesOptions,
	slug: string,
): Promise<{
	readonly page?: PageSpec;
	readonly errors: readonly IPageSpecError[];
}> => {
	const errors: IPageSpecError[] = [];
	const dirEntries = options.listDirs
		? await options.listDirs(joinPath(options.pagesRoot, slug))
		: [];
	const fileLangs = dirEntries.flatMap((entry) => {
		const match = /^(?<lang>[a-z]{2})\.md$/u.exec(entry);
		const lang = match?.groups?.['lang'];
		return lang && isLang(lang) ? [lang] : [];
	});

	if (!fileLangs.includes('en')) {
		errors.push({
			slug,
			code: 'missing-en',
			message: `Page '${slug}' is missing en.md`,
		});
	}

	const parsedTranslations = new Map<Lang, IParsedTranslation>();
	for (const lang of fileLangs) {
		const translation = await readTranslation(options, slug, lang);
		if ('error' in translation) {
			errors.push(translation.error);
			continue;
		}
		parsedTranslations.set(lang, translation.translation);
	}

	const english = parsedTranslations.get('en');
	const advertisedLanguages = new Set<Lang>(ALL_LANGS);
	for (const lang of fileLangs) {
		advertisedLanguages.add(lang);
	}
	for (const translation of parsedTranslations.values()) {
		for (const lang of translation.advertisedTranslations) {
			advertisedLanguages.add(lang);
		}
	}

	for (const lang of advertisedLanguages) {
		if (lang === 'en') {
			continue;
		}
		if (!parsedTranslations.has(lang)) {
			errors.push({
				slug,
				lang,
				code: 'missing-translation',
				message: `Page '${slug}' is missing ${lang}.md`,
			});
		}
	}

	if (english) {
		for (const lang of ALL_LANGS) {
			if (lang === 'en') continue;
			const translation = parsedTranslations.get(lang);
			if (!translation) continue;
			const missingKeys = [...english.canonicalKeys].filter(
				(key) => !translation.canonicalKeys.has(key),
			);
			if (missingKeys.length > 0) {
				errors.push({
					slug,
					lang,
					code: 'frontmatter-mismatch',
					message: `Page '${slug}' translation '${lang}' is missing frontmatter keys: ${missingKeys.join(', ')}`,
				});
			}
		}
	}

	const slugHasErrors = errors.some((error) => error.slug === slug);
	if (slugHasErrors || !english) {
		return { errors };
	}

	const translations: Record<Lang, IPageTranslation> = {
		ar: toPageTranslation(parsedTranslations.get('ar')),
		de: toPageTranslation(parsedTranslations.get('de')),
		en: toPageTranslation(parsedTranslations.get('en')),
		es: toPageTranslation(parsedTranslations.get('es')),
		fr: toPageTranslation(parsedTranslations.get('fr')),
		hi: toPageTranslation(parsedTranslations.get('hi')),
		it: toPageTranslation(parsedTranslations.get('it')),
		ja: toPageTranslation(parsedTranslations.get('ja')),
		pt: toPageTranslation(parsedTranslations.get('pt')),
		th: toPageTranslation(parsedTranslations.get('th')),
		vi: toPageTranslation(parsedTranslations.get('vi')),
		zh: toPageTranslation(parsedTranslations.get('zh')),
	};

	return {
		errors,
		page: {
			slug,
			frontmatter: english.frontmatter,
			body: english.body,
			translations,
		},
	};
};

const toPageTranslation = (
	translation: IParsedTranslation | undefined,
): IPageTranslation => {
	if (!translation) {
		throw new Error('Missing translation after validation');
	}
	return {
		frontmatter: translation.frontmatter,
		body: translation.body,
	};
};

const readTranslation = async (
	options: IReadPagesOptions,
	slug: string,
	lang: Lang,
): Promise<
	| { readonly translation: IParsedTranslation }
	| { readonly error: IPageSpecError }
> => {
	const relPath = joinPath(options.pagesRoot, slug, `${lang}.md`);
	const rawFile = await options.readFile(relPath);
	if (rawFile === undefined) {
		return {
			error: {
				slug,
				lang,
				code: lang === 'en' ? 'missing-en' : 'missing-translation',
				message: `Page '${slug}' is missing ${lang}.md`,
			},
		};
	}

	const parsedDocument = splitFrontmatter(rawFile);
	if ('error' in parsedDocument) {
		return {
			error: {
				slug,
				lang,
				code: 'frontmatter-invalid',
				message: parsedDocument.error,
			},
		};
	}

	const rawFrontmatter = parseSimpleFrontmatter(parsedDocument.frontmatter);
	if ('error' in rawFrontmatter) {
		return {
			error: {
				slug,
				lang,
				code: 'frontmatter-invalid',
				message: rawFrontmatter.error,
			},
		};
	}

	const validatedFrontmatter = rawFrontmatterSchema.safeParse(
		rawFrontmatter.value,
	);
	if (!validatedFrontmatter.success) {
		return {
			error: mapFrontmatterError(slug, lang, validatedFrontmatter.error),
		};
	}

	const normalized = normalizeFrontmatter(
		validatedFrontmatter.data as IRawFrontmatter,
	);
	return {
		translation: {
			slug,
			lang,
			frontmatter: normalized.frontmatter,
			body: parsedDocument.body,
			canonicalKeys: normalized.canonicalKeys,
			advertisedTranslations: normalized.advertisedTranslations,
		},
	};
};

const splitFrontmatter = (
	content: string,
):
	| { readonly frontmatter: string; readonly body: string }
	| { readonly error: string } => {
	const normalized = content.replace(/\r\n/g, '\n');
	const match = MARKDOWN_FRONTMATTER.exec(normalized);
	if (!match) {
		return {
			error: 'Expected a leading YAML frontmatter block delimited by ---',
		};
	}
	return {
		frontmatter: match[1] ?? '',
		body: match[2] ?? '',
	};
};

const parseSimpleFrontmatter = (
	input: string,
): { readonly value: Record<string, unknown> } | { readonly error: string } => {
	const result: Record<string, unknown> = {};
	const lines = input.split('\n');
	let index = 0;

	while (index < lines.length) {
		const rawLine = lines[index] ?? '';
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith('#')) {
			index += 1;
			continue;
		}

		const match =
			/^(?<key>[A-Za-z][A-Za-z0-9_-]*):(?:\s+(?<value>.*))?$/u.exec(
				rawLine,
			);
		if (!match?.groups?.['key']) {
			return { error: `Unsupported frontmatter line: ${rawLine}` };
		}

		const key = match.groups['key'];
		const value = match.groups['value'];
		if (value !== undefined) {
			result[key] = parseScalar(value.trim());
			index += 1;
			continue;
		}

		const nestedLines: string[] = [];
		index += 1;
		while (index < lines.length) {
			const nestedRawLine = lines[index] ?? '';
			if (nestedRawLine.trim().length === 0) {
				index += 1;
				continue;
			}
			if (!nestedRawLine.startsWith('  ')) {
				break;
			}
			nestedLines.push(nestedRawLine);
			index += 1;
		}

		if (nestedLines.length === 0) {
			result[key] = '';
			continue;
		}

		const parsedArray: unknown[] = [];
		for (const nestedLine of nestedLines) {
			const bullet = nestedLine.trim();
			if (!bullet.startsWith('- ')) {
				return {
					error: `Unsupported nested frontmatter line: ${nestedLine}`,
				};
			}
			parsedArray.push(parseScalar(bullet.slice(2).trim()));
		}
		result[key] = parsedArray;
	}

	return { value: result };
};

const parseScalar = (value: string): unknown => {
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (/^-?\d+$/u.test(value)) return Number(value);
	if (value.startsWith('[') && value.endsWith(']')) {
		const inner = value.slice(1, -1).trim();
		if (inner.length === 0) return [];
		return inner.split(',').map((part) => parseScalar(part.trim()));
	}
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
};

const mapFrontmatterError = (
	slug: string,
	lang: Lang,
	error: ZodError,
): IPageSpecError => {
	const unknownKeysOnly = error.issues.every(
		(issue) => issue.code === z.ZodIssueCode.unrecognized_keys,
	);
	return unknownKeysOnly
		? {
				slug,
				lang,
				code: 'frontmatter-unknown-keys',
				message: `Page '${slug}' translation '${lang}' has unknown frontmatter keys`,
			}
		: {
				slug,
				lang,
				code: 'frontmatter-invalid',
				message: `Page '${slug}' translation '${lang}' has invalid frontmatter`,
			};
};

const normalizeFrontmatter = (
	raw: IRawFrontmatter,
): {
	readonly frontmatter: IPageFrontmatter;
	readonly canonicalKeys: ReadonlySet<keyof IPageFrontmatter>;
	readonly advertisedTranslations: readonly Lang[];
} => {
	const canonicalKeys = new Set<keyof IPageFrontmatter>([
		'title',
		'description',
	]);
	if (raw.order !== undefined) canonicalKeys.add('order');
	if (raw.navLabel !== undefined) canonicalKeys.add('navLabel');
	if (raw.ogImage !== undefined) canonicalKeys.add('ogImage');
	if (raw.noindex !== undefined) canonicalKeys.add('noindex');

	return {
		frontmatter: {
			title: raw.title,
			description: raw.description,
			...(raw.order !== undefined ? { order: raw.order } : {}),
			...(raw.navLabel !== undefined ? { navLabel: raw.navLabel } : {}),
			...(raw.ogImage !== undefined ? { ogImage: raw.ogImage } : {}),
			...(raw.noindex !== undefined ? { noindex: raw.noindex } : {}),
		},
		canonicalKeys,
		advertisedTranslations: raw.translations ?? [],
	};
};

const joinPath = (...parts: readonly string[]): string =>
	parts
		.map((part) => part.replace(/^\/+|\/+$/gu, ''))
		.filter(Boolean)
		.join('/');

const isLang = (value: string): value is Lang => LANG_SET.has(value as Lang);
