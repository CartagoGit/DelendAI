import { describe, expect, it } from 'vitest';

import { languages } from '#I18N/ui';

import { readPages } from './reader';

const PAGES_ROOT = 'apps/web/src/data/pages';

describe('page-spec reader', () => {
	it('rejects pages with missing-en', async () => {
		const fs = createMemoryFs({
			[`${PAGES_ROOT}/guide/es.md`]: pageFile({
				title: 'Guia',
				description: 'Descripcion',
			}),
		});

		const result = await readPages({
			pagesRoot: PAGES_ROOT,
			readFile: fs.readFile,
			listDirs: fs.listDirs,
		});

		expect(result.errors).toContainEqual(
			expect.objectContaining({ code: 'missing-en', slug: 'guide' }),
		);
	});

	it('rejects unknown frontmatter keys', async () => {
		const fs = createMemoryFs({
			[`${PAGES_ROOT}/install/en.md`]: pageFile({
				title: 'Install',
				description: 'Install page',
				description_evil_extra_key: 'boom',
			}),
		});

		const result = await readPages({
			pagesRoot: PAGES_ROOT,
			readFile: fs.readFile,
			listDirs: fs.listDirs,
		});

		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: 'frontmatter-unknown-keys',
				slug: 'install',
				lang: 'en',
			}),
		);
	});

	it('rejects missing-translation', async () => {
		const fs = createMemoryFs({
			[`${PAGES_ROOT}/install/en.md`]: pageFile({
				title: 'Install',
				description: 'Install page',
				translations: ['es', 'de'],
			}),
			[`${PAGES_ROOT}/install/es.md`]: pageFile({
				title: 'Instalar',
				description: 'Pagina de instalacion',
			}),
		});

		const result = await readPages({
			pagesRoot: PAGES_ROOT,
			readFile: fs.readFile,
			listDirs: fs.listDirs,
		});

		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: 'missing-translation',
				slug: 'install',
				lang: 'de',
			}),
		);
	});

	it('accepts a well-formed install pilot', async () => {
		const files = Object.fromEntries(
			languages.map(({ code }) => [
				`${PAGES_ROOT}/install/${code}.md`,
				pageFile({
					title: `Install ${code}`,
					description: `Description ${code}`,
					order: 1,
					navLabel: `Nav ${code}`,
					ogImage: `/images/install-${code}.png`,
					noindex: false,
				}),
			]),
		);
		const fs = createMemoryFs(files);

		const result = await readPages({
			pagesRoot: PAGES_ROOT,
			readFile: fs.readFile,
			listDirs: fs.listDirs,
		});

		expect(result.errors).toEqual([]);
		expect(result.pages).toHaveLength(1);
		expect(result.pages[0]?.slug).toBe('install');
		expect(result.pages[0]?.translations.en.frontmatter.title).toBe(
			'Install en',
		);
		expect(result.pages[0]?.translations.zh.frontmatter.navLabel).toBe(
			'Nav zh',
		);
	});
});

const createMemoryFs = (files: Record<string, string>) => {
	const normalizedFiles = new Map(
		Object.entries(files).map(([path, content]) => [
			normalizePath(path),
			content,
		]),
	);

	return {
		readFile: async (relPath: string): Promise<string | undefined> =>
			normalizedFiles.get(normalizePath(relPath)),
		listDirs: async (relPath: string): Promise<readonly string[]> => {
			const prefix = withTrailingSlash(normalizePath(relPath));
			const entries = new Set<string>();
			for (const path of normalizedFiles.keys()) {
				if (!path.startsWith(prefix)) continue;
				const remainder = path.slice(prefix.length);
				if (remainder.length === 0) continue;
				const [entry] = remainder.split('/');
				if (entry) entries.add(entry);
			}
			return [...entries].sort();
		},
	};
};

const pageFile = (
	frontmatter: Record<string, unknown>,
	body = 'Body copy',
): string => {
	const lines = Object.entries(frontmatter).flatMap(([key, value]) =>
		serializeFrontmatterEntry(key, value),
	);
	return ['---', ...lines, '---', body].join('\n');
};

const serializeFrontmatterEntry = (
	key: string,
	value: unknown,
): readonly string[] => {
	if (Array.isArray(value)) {
		return [key + ':', ...value.map((item) => `  - ${String(item)}`)];
	}
	return [`${key}: ${serializeScalar(value)}`];
};

const serializeScalar = (value: unknown): string => {
	if (typeof value === 'boolean' || typeof value === 'number') {
		return String(value);
	}
	return JSON.stringify(String(value));
};

const normalizePath = (path: string): string => path.replace(/^\/+|\/+$/gu, '');

const withTrailingSlash = (path: string): string =>
	path.length === 0 ? '' : `${path}/`;
