import { describe, expect, it } from 'vitest';

import { languages } from '#I18N/ui';

import {
	buildPagesManifest,
	syncPagesManifest,
	type IManifestFs,
} from './gen-pages';

const PAGES_ROOT = 'apps/web/src/data/pages';

describe('gen-pages', () => {
	it('emits a stable manifest and preserves bytes across two runs', async () => {
		const fs = createMemoryFs(
			Object.fromEntries(
				languages.map(({ code }) => [
					`${PAGES_ROOT}/install/${code}.md`,
					pageFile({
						title: code === 'en' ? 'Install' : `Install ${code}`,
						description:
							code === 'en'
								? 'English install page'
								: `Translated install page ${code}`,
						order: 1,
						navLabel: `Nav ${code}`,
					}),
				]),
			),
		);

		const first = await buildPagesManifest({
			readFile: fs.readFile,
			listDirs: fs.listDirs,
			now: () => new Date('2026-06-27T00:00:00.000Z'),
		});
		expect(first.errors).toEqual([]);
		const json = JSON.parse(first.text) as {
			generatedAt: string;
			pages: Array<{
				slug: string;
				translations: Record<
					string,
					{ frontmatter: { title: string } }
				>;
			}>;
		};
		expect(json.generatedAt).toBe('2026-06-27T00:00:00.000Z');
		expect(json.pages).toHaveLength(1);
		expect(json.pages[0]?.slug).toBe('install');
		expect(Object.keys(json.pages[0]?.translations ?? {}).sort()).toEqual(
			languages.map(({ code }) => code).sort(),
		);
		expect(json.pages[0]?.translations.en?.frontmatter.title).toBe(
			'Install',
		);
		expect(json.pages[0]?.translations.zh?.frontmatter.title).toBe(
			'Install zh',
		);

		const second = await buildPagesManifest({
			readFile: fs.readFile,
			listDirs: fs.listDirs,
			existingManifestText: first.text,
			now: () => new Date('2030-01-01T00:00:00.000Z'),
		});
		expect(second.text).toBe(first.text);
	});

	it('fails in strict mode when a page is missing English', async () => {
		const fs = createMemoryFs({
			[`${PAGES_ROOT}/guide/es.md`]: pageFile({
				title: 'Guia',
				description: 'Descripcion',
			}),
		});

		const result = await syncPagesManifest({
			fs,
			strict: true,
			onInfo: () => {},
			onWarn: () => {},
			onError: () => {},
		});

		expect(result.ok).toBe(false);
		expect(result.exitCode).toBe(1);
		expect(result.errors).toContainEqual(
			expect.objectContaining({ code: 'missing-en', slug: 'guide' }),
		);
	});
});

const createMemoryFs = (files: Record<string, string>): IManifestFs => {
	const normalizedFiles = new Map(
		Object.entries(files).map(([path, content]) => [
			normalizePath(path),
			content,
		]),
	);
	let manifestText: string | undefined;

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
		readExistingManifest: async () => manifestText,
		writeManifest: async (content: string) => {
			manifestText = content;
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
