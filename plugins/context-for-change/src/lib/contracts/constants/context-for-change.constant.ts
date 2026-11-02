import { TOKEN_BUDGETS } from '@delendai/core/public';

export const CONTEXT_FOR_CHANGE_DEPENDS_ON = [
	'git',
	'search',
	'memory',
	'docs',
	'conventions',
	'refactor',
	'test-policy',
] as const;

export const DEFAULT_CONTEXT_FOR_CHANGE_MAX_BYTES =
	TOKEN_BUDGETS.toolPayloads.search.hard;

export const MAX_CONTEXT_FOR_CHANGE_SOURCE_FILES = 8;
export const MAX_CONTEXT_FOR_CHANGE_SYMBOLS_PER_FILE = 4;
export const MAX_CONTEXT_FOR_CHANGE_REFERENCE_SYMBOLS = 3;
export const MAX_CONTEXT_FOR_CHANGE_TEST_FILES = 5;
export const MAX_CONTEXT_FOR_CHANGE_DOC_HITS = 3;
export const MAX_CONTEXT_FOR_CHANGE_MEMORY_NOTES = 3;
export const CONTEXT_FOR_CHANGE_SEARCH_MAX_RESULTS = 30;
export const CONTEXT_FOR_CHANGE_SEARCH_MAX_RELATED_TESTS = 20;
export const CONTEXT_FOR_CHANGE_MAX_PREVIEW_CHARS = 240;
export const CONTEXT_FOR_CHANGE_SOURCE_EXTENSIONS = [
	'ts',
	'tsx',
	'js',
	'jsx',
	'mjs',
	'cjs',
] as const;
export const CONTEXT_FOR_CHANGE_TEST_FILE_RE =
	/(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/u;
