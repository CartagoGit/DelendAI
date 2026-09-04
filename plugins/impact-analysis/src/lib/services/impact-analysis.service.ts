import { basename, extname } from 'node:path';

import {
	SafeWorkspaceReader,
	WorkspaceContainmentError,
} from '@delendai/core/public';

import {
	POLICY_GUIDANCE,
	resolveTestPolicy,
} from '@delendai/test-policy/public';
import {
	checkRepo,
	createGitRunner,
	gitChanged,
	gitDiffStat,
} from '@delendai/git/public';
import { buildNavEngine } from '@delendai/refactor/public';
import { searchWorkspace } from '@delendai/search/public';

import {
	HIGH_RISK_AFFECTED_PACKAGES_THRESHOLD,
	HIGH_RISK_DEPENDENTS_THRESHOLD,
	IMPACT_ANALYSIS_SEARCH_MAX_RESULTS,
	IMPACT_ANALYSIS_SEARCH_ROOTS,
	IMPACT_ANALYSIS_SOURCE_EXTENSIONS,
	IMPACT_ANALYSIS_TEST_FILE_RE,
	MAX_IMPACT_ANALYSIS_ALL_TEST_SCAN_RESULTS,
	MAX_IMPACT_ANALYSIS_DEPENDENTS,
	MAX_IMPACT_ANALYSIS_FILES,
	MAX_IMPACT_ANALYSIS_RECOMMENDED_TESTS,
	MAX_IMPACT_ANALYSIS_SKIP_TESTS,
	MAX_IMPACT_ANALYSIS_SYMBOLS,
	MEDIUM_RISK_DEPENDENTS_THRESHOLD,
	IMPACT_ANALYSIS_DEPENDS_ON,
} from '../contracts/constants/impact-analysis.constant';
import type {
	IImpactAnalyzeToolArgs,
	IImpactAnalysisToolOptions,
	ITestsForChangeToolArgs,
	TImpactAnalysisRisk,
} from '../contracts/interfaces/impact-analysis.interface';

const TEST_DISCOVERY_QUERY = '\\b(?:describe|it|test)\\b';

const unique = (values: readonly string[]): string[] =>
	Array.from(new Set(values));

const isSourceFile = (filePath: string): boolean => {
	const ext = extname(filePath).slice(1).toLowerCase();
	return IMPACT_ANALYSIS_SOURCE_EXTENSIONS.includes(
		ext as (typeof IMPACT_ANALYSIS_SOURCE_EXTENSIONS)[number],
	);
};

const normalizePath = (
	reader: SafeWorkspaceReader,
	filePath: string,
): string =>
	filePath.length === 0 ? filePath : reader.resolve(filePath).relativePath;

const stem = (filePath: string): string =>
	basename(filePath, extname(filePath));

const parseFilesFromGitDiff = (gitDiff: string): string[] =>
	unique(
		Array.from(
			gitDiff.matchAll(
				/^(?:diff --git a\/.+ b\/(.+)|\+\+\+ b\/(.+))$/gmu,
			),
		)
			.map((match) => match[1] ?? match[2] ?? '')
			.filter((filePath) => filePath.length > 0),
	);

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

const collectSymbolsFromFile = (filePath: string, source: string): string[] =>
	buildNavEngine(filePath, source)
		.listSymbols()
		.map((hit) => hit.name);

const candidateQueries = (
	files: readonly string[],
	symbols: readonly string[],
): string[] => unique([...symbols, ...files.map((file) => stem(file))]);

const isTestFile = (filePath: string): boolean =>
	IMPACT_ANALYSIS_TEST_FILE_RE.test(filePath);

const toPackageScope = (filePath: string): string | undefined => {
	const [head, second] = filePath.split('/');
	if (head === 'packages' || head === 'plugins' || head === 'apps') {
		return second === undefined ? head : `${head}/${second}`;
	}
	if (head === 'extensions') {
		return second === undefined ? head : `${head}/${second}`;
	}
	if (head === 'tools') return 'tools';
	return undefined;
};

export const inferRisk = (
	affectedPackages: readonly string[],
	dependents: readonly string[],
): TImpactAnalysisRisk => {
	if (
		affectedPackages.includes('packages/core') ||
		dependents.length >= HIGH_RISK_DEPENDENTS_THRESHOLD ||
		affectedPackages.length >= HIGH_RISK_AFFECTED_PACKAGES_THRESHOLD
	) {
		return 'high';
	}
	if (dependents.length >= MEDIUM_RISK_DEPENDENTS_THRESHOLD) {
		return 'medium';
	}
	return 'low';
};

const collectSearchHits = async (
	workspaceRootAbs: string,
	query: string,
): Promise<readonly string[]> => {
	const result = await searchWorkspace(workspaceRootAbs, query, {
		roots: [...IMPACT_ANALYSIS_SEARCH_ROOTS],
		extensions: [...IMPACT_ANALYSIS_SOURCE_EXTENSIONS],
		maxResults: IMPACT_ANALYSIS_SEARCH_MAX_RESULTS,
	});
	return unique(result.hits.map((hit) => hit.file));
};

const collectDependents = async (
	workspaceRootAbs: string,
	anchorFiles: readonly string[],
	changedSymbols: readonly string[],
): Promise<string[]> => {
	const files = new Set<string>();
	for (const symbol of changedSymbols) {
		for (const file of await collectSearchHits(workspaceRootAbs, symbol)) {
			if (anchorFiles.includes(file) || isTestFile(file)) continue;
			files.add(file);
			if (files.size >= MAX_IMPACT_ANALYSIS_DEPENDENTS) {
				return [...files];
			}
		}
	}
	return [...files];
};

const collectMatchedTests = async (
	workspaceRootAbs: string,
	queries: readonly string[],
): Promise<string[]> => {
	const matches = new Set<string>();
	for (const query of queries) {
		for (const file of await collectSearchHits(workspaceRootAbs, query)) {
			if (!isTestFile(file)) continue;
			matches.add(file);
			if (matches.size >= MAX_IMPACT_ANALYSIS_RECOMMENDED_TESTS) {
				return [...matches];
			}
		}
	}
	return [...matches];
};

const collectAllKnownTests = async (
	workspaceRootAbs: string,
): Promise<string[]> => {
	const result = await searchWorkspace(
		workspaceRootAbs,
		TEST_DISCOVERY_QUERY,
		{
			roots: [...IMPACT_ANALYSIS_SEARCH_ROOTS],
			extensions: [...IMPACT_ANALYSIS_SOURCE_EXTENSIONS],
			maxResults: MAX_IMPACT_ANALYSIS_ALL_TEST_SCAN_RESULTS,
			regex: true,
		},
	);
	return unique(result.hits.map((hit) => hit.file).filter(isTestFile));
};

export const selectSkipSample = (
	allTests: readonly string[],
	run: readonly string[],
): string[] =>
	allTests
		.filter((file) => !run.includes(file))
		.slice(0, MAX_IMPACT_ANALYSIS_SKIP_TESTS);

export const buildCoverageFocus = (
	affectedPackages: readonly string[],
	run: readonly string[],
): string[] => {
	const resolved = resolveTestPolicy({});
	const hasCoverageExpectation = POLICY_GUIDANCE[resolved.mode].length > 0;
	if (hasCoverageExpectation && affectedPackages.length > 0) {
		return [...affectedPackages];
	}
	return run
		.map((file) => toPackageScope(file))
		.filter((scope): scope is string => scope !== undefined);
};

const resolveAnchorFiles = async (
	args: {
		readonly files?: readonly string[] | undefined;
		readonly gitDiff?: string | undefined;
	},
	options: IImpactAnalysisToolOptions,
): Promise<string[]> => {
	const reader = new SafeWorkspaceReader(options.workspaceRootAbs);
	const normalizedFiles =
		args.files?.map((file) => normalizePath(reader, file)) ?? [];
	const diffFiles =
		args.gitDiff === undefined ? [] : parseFilesFromGitDiff(args.gitDiff);
	const runner = createGitRunner(options.workspaceRootAbs);
	const repo = await checkRepo(runner);
	const changedFiles = repo.ok ? await gitChanged(runner) : [];
	void (repo.ok ? await gitDiffStat(runner) : undefined);
	return unique([...normalizedFiles, ...diffFiles, ...changedFiles])
		.filter((file) => isSourceFile(file))
		.slice(0, MAX_IMPACT_ANALYSIS_FILES);
};

interface IComputedImpactAnalysis {
	readonly changedSymbols: readonly string[];
	readonly dependents: readonly string[];
	readonly affectedPackages: readonly string[];
	readonly recommendedTests: readonly string[];
	readonly risk: TImpactAnalysisRisk;
}

export const computeImpactAnalysis = async (
	args: IImpactAnalyzeToolArgs,
	options: IImpactAnalysisToolOptions,
): Promise<IComputedImpactAnalysis> => {
	const reader = new SafeWorkspaceReader(options.workspaceRootAbs);
	const anchorFiles = await resolveAnchorFiles(args, options);
	const symbolSet = new Set(args.symbols ?? []);
	for (const file of anchorFiles) {
		if (isTestFile(file)) continue;
		const source = await readSource(reader, file);
		if (source === undefined) continue;
		for (const symbol of collectSymbolsFromFile(file, source)) {
			symbolSet.add(symbol);
			if (symbolSet.size >= MAX_IMPACT_ANALYSIS_SYMBOLS) break;
		}
		if (symbolSet.size >= MAX_IMPACT_ANALYSIS_SYMBOLS) break;
	}
	const changedSymbols = [...symbolSet].slice(0, MAX_IMPACT_ANALYSIS_SYMBOLS);
	const dependents = await collectDependents(
		options.workspaceRootAbs,
		anchorFiles,
		changedSymbols,
	);
	const recommendedTests = await collectMatchedTests(
		options.workspaceRootAbs,
		candidateQueries(anchorFiles, changedSymbols),
	);
	const affectedPackages = unique(
		[...anchorFiles, ...dependents, ...recommendedTests]
			.map((file) => toPackageScope(file))
			.filter((scope): scope is string => scope !== undefined),
	);
	return {
		changedSymbols,
		dependents,
		affectedPackages,
		recommendedTests,
		risk: inferRisk(affectedPackages, dependents),
	};
};

export const computeTestsForChange = async (
	args: ITestsForChangeToolArgs,
	options: IImpactAnalysisToolOptions,
): Promise<
	Omit<ITestsForChangeToolArgs, 'files' | 'symbols'> & {
		readonly run: readonly string[];
		readonly skip: readonly string[];
		readonly coverageFocus: readonly string[];
		readonly likelyRelatedFailures: readonly string[];
		readonly affectedPackages: readonly string[];
	}
> => {
	const analysis = await computeImpactAnalysis(args, options);
	const allTests = await collectAllKnownTests(options.workspaceRootAbs);
	const run = analysis.recommendedTests;
	return {
		run,
		skip: selectSkipSample(allTests, run),
		coverageFocus: buildCoverageFocus(analysis.affectedPackages, run),
		likelyRelatedFailures: run.slice(
			0,
			MAX_IMPACT_ANALYSIS_RECOMMENDED_TESTS,
		),
		affectedPackages: analysis.affectedPackages,
	};
};

export const buildImpactAnalyzePayload = async (
	args: IImpactAnalyzeToolArgs,
	options: IImpactAnalysisToolOptions,
) => ({
	...(await computeImpactAnalysis(args, options)),
	dependsOn: [...IMPACT_ANALYSIS_DEPENDS_ON],
});
