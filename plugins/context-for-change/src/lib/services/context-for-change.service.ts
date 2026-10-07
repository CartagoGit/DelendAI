import { basename, extname, isAbsolute, resolve } from 'node:path';

import type { IToolTextResult } from '@delendai/core/public';
import {
	SafeWorkspaceReader,
	toolError,
	toolJson,
	truncateIfTooLarge,
	WorkspaceContainmentError,
} from '@delendai/core/public';
import { classifyPath } from '@delendai/conventions/public';
import { readDoc, searchDocs } from '@delendai/docs/public';
import {
	checkRepo,
	createGitRunner,
	gitChanged,
	gitDiffStat,
} from '@delendai/git/public';
import { recall } from '@delendai/memory/public';
import { buildNavEngine } from '@delendai/refactor/public';
import { searchWorkspace } from '@delendai/search/public';

import {
	CONTEXT_FOR_CHANGE_DEPENDS_ON,
	CONTEXT_FOR_CHANGE_SEARCH_MAX_RELATED_TESTS,
	CONTEXT_FOR_CHANGE_SEARCH_MAX_RESULTS,
	CONTEXT_FOR_CHANGE_SOURCE_EXTENSIONS,
	CONTEXT_FOR_CHANGE_TEST_FILE_RE,
	MAX_CONTEXT_FOR_CHANGE_DOC_HITS,
	MAX_CONTEXT_FOR_CHANGE_MEMORY_NOTES,
	MAX_CONTEXT_FOR_CHANGE_REFERENCE_SYMBOLS,
	MAX_CONTEXT_FOR_CHANGE_SOURCE_FILES,
	MAX_CONTEXT_FOR_CHANGE_SYMBOLS_PER_FILE,
	MAX_CONTEXT_FOR_CHANGE_TEST_FILES,
} from '../contracts/constants/context-for-change.constant';
import {
	buildTruncatedContextOutput,
	formatTestPolicySummary,
	limitContextPreview,
	makeContextSection,
} from './context-for-change-format.service';
import type {
	IContextForChangeOutput,
	IContextForChangeSection,
	IContextForChangeToolArgs,
	IContextForChangeToolOptions,
} from '../contracts/interfaces/context-for-change.interface';

const isSourceFile = (filePath: string): boolean => {
	const ext = extname(filePath).slice(1).toLowerCase();
	return CONTEXT_FOR_CHANGE_SOURCE_EXTENSIONS.includes(
		ext as (typeof CONTEXT_FOR_CHANGE_SOURCE_EXTENSIONS)[number],
	);
};

const toWorkspacePath = (
	reader: SafeWorkspaceReader,
	inputPath: string,
): string =>
	inputPath.length === 0 ? inputPath : reader.resolve(inputPath).relativePath;

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const baseNameWithoutExt = (filePath: string): string =>
	basename(filePath, extname(filePath));

const parseFilesFromGitDiff = (gitDiff: string): string[] => {
	const files = new Set<string>();
	for (const line of gitDiff.split('\n')) {
		if (line.startsWith('diff --git ')) {
			const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
			const filePath = match?.[2];
			if (filePath !== undefined) files.add(filePath);
			continue;
		}
		if (line.startsWith('+++ b/')) {
			files.add(line.slice('+++ b/'.length));
		}
	}
	return [...files];
};

const readSource = async (
	reader: SafeWorkspaceReader,
	filePath: string,
): Promise<string | undefined> => {
	try {
		return (await reader.readText(filePath)).content;
	} catch (error) {
		if (error instanceof WorkspaceContainmentError) {
			throw error;
		}
		return undefined;
	}
};

const toContainmentToolError = (
	error: WorkspaceContainmentError,
): IToolTextResult =>
	toolError(
		`workspace-containment: ${error.message}`,
		'Pass only workspace-contained source paths; absolute paths outside the workspace and reserved paths like .git, .env and node_modules are rejected.',
	);

const collectSymbolNames = (source: string, filePath: string): string[] =>
	buildNavEngine(filePath, source)
		.listSymbols()
		.slice(0, MAX_CONTEXT_FOR_CHANGE_SYMBOLS_PER_FILE)
		.map((hit) => hit.name);

const collectReferenceSummary = async (
	workspaceRootAbs: string,
	symbols: readonly string[],
	files: readonly string[],
): Promise<string> => {
	const parts: string[] = [];
	for (const symbol of symbols.slice(
		0,
		MAX_CONTEXT_FOR_CHANGE_REFERENCE_SYMBOLS,
	)) {
		const result = await searchWorkspace(workspaceRootAbs, symbol, {
			roots: ['packages', 'plugins', 'apps', 'tools', 'extensions'],
			extensions: [...CONTEXT_FOR_CHANGE_SOURCE_EXTENSIONS],
			maxResults: CONTEXT_FOR_CHANGE_SEARCH_MAX_RESULTS,
		});
		const refs = unique(
			result.hits
				.map((hit) => hit.file)
				.filter((file) => !files.includes(file)),
		);
		if (refs.length === 0) continue;
		parts.push(
			`${symbol}: ${refs.slice(0, 3).join(', ')}${refs.length > 3 ? ` (+${refs.length - 3})` : ''}`,
		);
	}
	return parts.length > 0
		? parts.join(' | ')
		: 'No cross-file references found in the bounded lexical scan.';
};

const collectRelatedTests = async (
	workspaceRootAbs: string,
	files: readonly string[],
	symbol?: string,
): Promise<string[]> => {
	const queries = unique(
		[symbol, ...files.map((file) => baseNameWithoutExt(file))].filter(
			(value): value is string => value !== undefined && value.length > 0,
		),
	);
	const relatedTests = new Set<string>();
	for (const query of queries) {
		const result = await searchWorkspace(workspaceRootAbs, query, {
			roots: ['packages', 'plugins', 'apps', 'tools'],
			extensions: ['ts', 'tsx', 'js'],
			maxResults: CONTEXT_FOR_CHANGE_SEARCH_MAX_RELATED_TESTS,
		});
		for (const hit of result.hits) {
			if (CONTEXT_FOR_CHANGE_TEST_FILE_RE.test(hit.file)) {
				relatedTests.add(hit.file);
			}
		}
	}
	return [...relatedTests].slice(0, MAX_CONTEXT_FOR_CHANGE_TEST_FILES);
};

const collectDocsSummary = async (
	workspaceRootAbs: string,
	files: readonly string[],
	task: string | undefined,
	symbol: string | undefined,
	docsRoots: readonly string[] | undefined,
): Promise<string> => {
	const query =
		task?.trim() ||
		symbol?.trim() ||
		baseNameWithoutExt(files[0] ?? '').trim();
	if (query.length === 0) {
		return 'No task, symbol or file stem available to query docs.';
	}
	const docs = await searchDocs(workspaceRootAbs, query, {
		...(docsRoots !== undefined ? { roots: docsRoots } : {}),
		limit: MAX_CONTEXT_FOR_CHANGE_DOC_HITS,
	});
	if (docs.hits.length === 0) {
		return (
			docs.diagnostic ?? 'No related docs found in the bounded search.'
		);
	}
	const parts: string[] = [];
	for (const hit of docs.hits.slice(0, MAX_CONTEXT_FOR_CHANGE_DOC_HITS)) {
		const content = await readDoc(workspaceRootAbs, hit.path);
		parts.push(`${hit.path}: ${limitContextPreview(content.title)}`);
	}
	return parts.join(' | ');
};

const collectMemorySummary = async (
	workspaceRootAbs: string,
	memoryStorePath: string | undefined,
	task: string | undefined,
	symbol: string | undefined,
	files: readonly string[],
): Promise<string> => {
	if (memoryStorePath === undefined) {
		return 'unavailable: memoryStorePath is not configured for this plugin instance';
	}
	const query =
		task?.trim() ||
		symbol?.trim() ||
		baseNameWithoutExt(files[0] ?? '').trim();
	const storePath = isAbsolute(memoryStorePath)
		? memoryStorePath
		: resolve(workspaceRootAbs, memoryStorePath);
	try {
		const notes = await recall(storePath, {
			...(query.length > 0 ? { query } : {}),
			limit: MAX_CONTEXT_FOR_CHANGE_MEMORY_NOTES,
		});
		return notes.length > 0
			? notes.map((note) => note.title).join(' | ')
			: 'No recent memory notes matched the bounded query.';
	} catch (error) {
		return `unavailable: ${error instanceof Error ? error.message : String(error)}`;
	}
};

const formatConventionsSummary = (files: readonly string[]): string =>
	files.map((file) => `${file}: ${classifyPath(file)}`).join(' | ');

export const runContextForChangeService = async (
	args: IContextForChangeToolArgs,
	options: IContextForChangeToolOptions,
): Promise<IToolTextResult> => {
	const reader = new SafeWorkspaceReader(options.workspaceRootAbs);
	if (
		args.files === undefined &&
		args.gitDiff === undefined &&
		args.symbol === undefined
	) {
		return toolError(
			'context_for_change requires at least one of files, gitDiff or symbol',
			'Provide files, gitDiff or symbol so the tool can anchor the context.',
		);
	}

	try {
		const gitDiffFiles =
			args.gitDiff !== undefined
				? parseFilesFromGitDiff(args.gitDiff)
				: [];
		const inputFiles =
			args.files?.map((file) => toWorkspacePath(reader, file)) ?? [];
		const runner = createGitRunner(options.workspaceRootAbs);
		const repo = await checkRepo(runner);
		const changedFiles = repo.ok ? await gitChanged(runner) : [];
		const anchorFiles = unique([
			...inputFiles,
			...gitDiffFiles,
			...changedFiles,
		])
			.filter((file) => isSourceFile(file))
			.slice(0, MAX_CONTEXT_FOR_CHANGE_SOURCE_FILES);

		if (anchorFiles.length === 0 && args.symbol !== undefined) {
			const symbolHits = await searchWorkspace(
				options.workspaceRootAbs,
				args.symbol,
				{
					roots: [
						'packages',
						'plugins',
						'apps',
						'tools',
						'extensions',
					],
					extensions: [...CONTEXT_FOR_CHANGE_SOURCE_EXTENSIONS],
					maxResults: CONTEXT_FOR_CHANGE_SEARCH_MAX_RESULTS,
				},
			);
			anchorFiles.push(
				...unique(symbolHits.hits.map((hit) => hit.file)).slice(
					0,
					MAX_CONTEXT_FOR_CHANGE_SOURCE_FILES,
				),
			);
		}

		const sections: IContextForChangeSection[] = [];
		if (args.gitDiff !== undefined || changedFiles.length > 0) {
			const diffPath = anchorFiles[0];
			const diffSummary =
				repo.ok && diffPath !== undefined
					? await gitDiffStat(runner, { path: diffPath })
					: undefined;
			const gitParts = [
				gitDiffFiles.length > 0
					? `diff files: ${gitDiffFiles.join(', ')}`
					: undefined,
				changedFiles.length > 0
					? `working tree: ${changedFiles.slice(0, 4).join(', ')}${changedFiles.length > 4 ? ` (+${changedFiles.length - 4})` : ''}`
					: undefined,
				diffSummary && diffSummary.length > 0 ? diffSummary : undefined,
				repo.ok ? undefined : repo.reason,
			].filter(
				(part): part is string => part !== undefined && part.length > 0,
			);
			sections.push(makeContextSection('git', gitParts.join(' | ')));
		}

		const symbolNames = new Set<string>();
		for (const file of anchorFiles) {
			const source = await readSource(reader, file);
			if (source === undefined) continue;
			for (const symbolName of collectSymbolNames(source, file)) {
				symbolNames.add(symbolName);
			}
		}
		if (args.symbol !== undefined) {
			symbolNames.add(args.symbol);
		}
		const compactSymbols = [...symbolNames].slice(
			0,
			MAX_CONTEXT_FOR_CHANGE_SOURCE_FILES *
				MAX_CONTEXT_FOR_CHANGE_SYMBOLS_PER_FILE,
		);
		if (compactSymbols.length > 0) {
			sections.push(
				makeContextSection('symbols', compactSymbols.join(', ')),
			);
			sections.push(
				makeContextSection(
					'references',
					await collectReferenceSummary(
						options.workspaceRootAbs,
						compactSymbols,
						anchorFiles,
					),
				),
			);
		}

		const relatedTests = await collectRelatedTests(
			options.workspaceRootAbs,
			anchorFiles,
			args.symbol,
		);
		sections.push(
			makeContextSection(
				'tests',
				relatedTests.length > 0
					? relatedTests.join(', ')
					: 'No related test files found in the bounded lexical scan.',
			),
		);

		if (anchorFiles.length > 0) {
			sections.push(
				makeContextSection(
					'conventions',
					formatConventionsSummary(anchorFiles),
				),
			);
		}

		sections.push(
			makeContextSection(
				'docs',
				await collectDocsSummary(
					options.workspaceRootAbs,
					anchorFiles,
					args.task,
					args.symbol,
					options.docsRoots,
				),
			),
		);
		sections.push(
			makeContextSection(
				'test-policy',
				formatTestPolicySummary(options.testPolicyMode),
			),
		);
		sections.push(
			makeContextSection(
				'memory',
				await collectMemorySummary(
					options.workspaceRootAbs,
					options.memoryStorePath,
					args.task,
					args.symbol,
					anchorFiles,
				),
			),
		);

		const rawOutput = {
			dependsOn: [...CONTEXT_FOR_CHANGE_DEPENDS_ON],
			files: anchorFiles,
			sections,
		};
		const truncation = truncateIfTooLarge(rawOutput, options.maxBytes);
		const output: IContextForChangeOutput = truncation.truncated
			? buildTruncatedContextOutput(truncation, anchorFiles)
			: {
					dependsOn: [...CONTEXT_FOR_CHANGE_DEPENDS_ON],
					files: anchorFiles,
					sections,
					bytes: truncation.finalBytes,
					truncated: false,
				};
		return toolJson(output);
	} catch (error) {
		if (error instanceof WorkspaceContainmentError) {
			return toContainmentToolError(error);
		}
		throw error;
	}
};
