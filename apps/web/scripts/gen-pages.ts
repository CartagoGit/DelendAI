import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	readPages,
	type IPageSpecError,
	type IReadPagesOptions,
} from '../src/lib/page-spec/reader';
import type { PageSpec } from '../src/lib/page-spec/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const PAGES_ROOT = 'apps/web/src/data/pages';
const OUT = resolve(HERE, '..', 'src', 'data', 'manifests', 'pages.json');

export interface IPagesManifest {
	readonly generatedAt: string;
	readonly pages: readonly PageSpec[];
}

export interface IManifestFs
	extends Pick<IReadPagesOptions, 'readFile' | 'listDirs'> {
	readonly readExistingManifest: () => Promise<string | undefined>;
	readonly writeManifest: (content: string) => Promise<void>;
}

export interface IBuildPagesManifestOptions
	extends Pick<IReadPagesOptions, 'readFile' | 'listDirs'> {
	readonly existingManifestText?: string;
	readonly now?: () => Date;
	readonly pagesRoot?: string;
}

export interface IBuildPagesManifestResult {
	readonly manifest: IPagesManifest;
	readonly text: string;
	readonly errors: readonly IPageSpecError[];
	readonly skippedSlugs: readonly string[];
}

export interface ISyncPagesManifestOptions {
	readonly fs?: IManifestFs;
	readonly check?: boolean;
	readonly strict?: boolean;
	readonly now?: () => Date;
	readonly onInfo?: (message: string) => void;
	readonly onWarn?: (message: string) => void;
	readonly onError?: (message: string) => void;
}

export interface ISyncPagesManifestResult {
	readonly ok: boolean;
	readonly changed: boolean;
	readonly wrote: boolean;
	readonly manifest: IPagesManifest;
	readonly text: string;
	readonly errors: readonly IPageSpecError[];
	readonly exitCode: 0 | 1;
}

const buildNodeFs = (): IManifestFs => ({
	readFile: async (relPath: string) => {
		try {
			return await readFile(resolve(ROOT, relPath), 'utf8');
		} catch (error) {
			if (isMissing(error)) return undefined;
			throw error;
		}
	},
	listDirs: async (relPath: string) => {
		try {
			return (await readdir(resolve(ROOT, relPath))).sort();
		} catch (error) {
			if (isMissing(error)) return [];
			throw error;
		}
	},
	readExistingManifest: async () => {
		try {
			return await readFile(OUT, 'utf8');
		} catch (error) {
			if (isMissing(error)) return undefined;
			throw error;
		}
	},
	writeManifest: async (content: string) => {
		await mkdir(dirname(OUT), { recursive: true });
		await writeFile(OUT, content, 'utf8');
	},
});

export const buildPagesManifest = async (
	options: IBuildPagesManifestOptions,
): Promise<IBuildPagesManifestResult> => {
	const pagesRoot = options.pagesRoot ?? PAGES_ROOT;
	const { pages, errors } = await readPages({
		pagesRoot,
		readFile: options.readFile,
		listDirs: options.listDirs,
	});
	const sortedPages = [...pages].sort((left, right) =>
		left.slug.localeCompare(right.slug),
	);
	const existing = parseManifest(options.existingManifestText);
	const nextPagesJson = stableStringify(sortedPages);
	const previousPagesJson = existing
		? stableStringify(existing.pages)
		: undefined;
	const generatedAt =
		existing && previousPagesJson === nextPagesJson
			? existing.generatedAt
			: (options.now ?? (() => new Date()))().toISOString();
	const manifest: IPagesManifest = {
		generatedAt,
		pages: sortedPages,
	};
	const skippedSlugs = [...new Set(errors.map((error) => error.slug))].sort();

	return {
		manifest,
		text: `${stableStringify(manifest)}\n`,
		errors,
		skippedSlugs,
	};
};

export const syncPagesManifest = async (
	options: ISyncPagesManifestOptions = {},
): Promise<ISyncPagesManifestResult> => {
	const fs = options.fs ?? buildNodeFs();
	const info = options.onInfo ?? console.log;
	const warn = options.onWarn ?? console.warn;
	const errorOut = options.onError ?? console.error;
	const existingManifestText = await fs.readExistingManifest();
	const built = await buildPagesManifest({
		readFile: fs.readFile,
		listDirs: fs.listDirs,
		existingManifestText,
		now: options.now,
	});

	for (const error of built.errors) {
		warn(formatError(error));
	}
	if (built.skippedSlugs.length > 0) {
		warn(
			`gen-pages: skipped ${built.skippedSlugs.length} slug(s): ${built.skippedSlugs.join(', ')}`,
		);
	}

	if (options.strict && built.errors.length > 0) {
		errorOut(
			`gen-pages (strict): refusing to write manifest with ${built.errors.length} validation error(s).`,
		);
		return {
			ok: false,
			changed: existingManifestText !== built.text,
			wrote: false,
			manifest: built.manifest,
			text: built.text,
			errors: built.errors,
			exitCode: 1,
		};
	}

	const changed = existingManifestText !== built.text;
	if (options.check) {
		if (changed) {
			errorOut(
				'gen-pages --check: pages.json is stale. Re-run bun run gen:pages.',
			);
			return {
				ok: false,
				changed: true,
				wrote: false,
				manifest: built.manifest,
				text: built.text,
				errors: built.errors,
				exitCode: 1,
			};
		}
		info('gen-pages --check: pages.json is up to date.');
		return {
			ok: true,
			changed: false,
			wrote: false,
			manifest: built.manifest,
			text: built.text,
			errors: built.errors,
			exitCode: 0,
		};
	}

	if (changed) {
		await fs.writeManifest(built.text);
		info(`wrote ${OUT} — ${built.manifest.pages.length} page(s).`);
	} else {
		info(
			`pages manifest already up to date — ${built.manifest.pages.length} page(s).`,
		);
	}

	return {
		ok: true,
		changed,
		wrote: changed,
		manifest: built.manifest,
		text: built.text,
		errors: built.errors,
		exitCode: 0,
	};
};

const parseManifest = (
	input: string | undefined,
): IPagesManifest | undefined => {
	if (!input) return undefined;
	try {
		return JSON.parse(input) as IPagesManifest;
	} catch {
		return undefined;
	}
};

const isMissing = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

const stableStringify = (value: unknown): string =>
	JSON.stringify(sortValue(value), null, 2);

const sortValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map((item) => sortValue(item));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entryValue]) => [key, sortValue(entryValue)]),
		);
	}
	return value;
};

const formatError = (error: IPageSpecError): string => {
	const lang = error.lang ? ` (${error.lang})` : '';
	return `gen-pages: [${error.code}] ${error.slug}${lang} — ${error.message}`;
};

const main = async (): Promise<void> => {
	const strict = process.argv.includes('--strict');
	const check = process.argv.includes('--check');
	const result = await syncPagesManifest({ strict, check });
	if (!result.ok) process.exit(result.exitCode);
};

void main();
