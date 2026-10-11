#!/usr/bin/env bun
/**
 * unregistered-tools.script.ts — x00533 S3.
 *
 * A tool builder that compiles, exports, and is fully unit-tested but
 * is never wired into its plugin's `tools: [...]` array does not
 * exist. `proposals_db_status` (x00510 S3) shipped that way: it was
 * declared "the first diagnostic an operator runs against a suspect
 * database", it had a spec with seven passing cases, and its ONLY
 * reference inside `src` was its own definition. Every other reference
 * was in tests. Nothing failed, because tests call the builder
 * directly — exactly the shape of a green suite over an absent
 * feature.
 *
 * This lint names that shape: an exported `IToolRegistration` builder
 * under `plugins/*​/src` whose only references outside its own file are
 * in test code (or that has no outside reference at all).
 *
 * The pure core takes the corpus as data. The only I/O is a tracked-file
 * lister and a file reader, both injectable, so the spec runs without a
 * repository and without touching the disk.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Pathspecs for the corpus: every TypeScript file git tracks. */
export const CORPUS_PATHSPECS = ['*.ts', '*.tsx'] as const;

/** A builder is only in scope when it is declared under this shape. */
export const PLUGIN_SRC_PATTERN = /^plugins\/[^/]+\/src\//;

/**
 * The type whose builders this lint guards. A declaration is a tool
 * builder when its declaration head mentions this type.
 */
export const REGISTRATION_TYPE = 'IToolRegistration';

/** Lines of the declaration head scanned for `IToolRegistration`. */
const DECLARATION_WINDOW_LINES = 8;

// ---------------------------------------------------------------------
// Exclusions
// ---------------------------------------------------------------------

export interface IUnregisteredToolExclusion {
	/** Exported symbol name, exactly as declared. */
	readonly symbol: string;
	/** Repo-relative path of the file that declares it. */
	readonly file: string;
	/**
	 * Why this builder is legitimately unreferenced outside tests.
	 * REQUIRED and non-empty: an exclusion without a stated reason is
	 * ignored, so silencing this lint always costs an explanation.
	 */
	readonly reason: string;
}

/**
 * Explicit, comment-justified exclusions.
 *
 * Add an entry ONLY when a builder is deliberately not wired — a
 * builder kept for an external host to assemble, or one behind a
 * feature flag that lands in a later slice. "I will wire it later" is
 * not a reason; a proposal id and the slice that wires it is.
 */
export const UNREGISTERED_TOOL_EXCLUSIONS: readonly IUnregisteredToolExclusion[] =
	[];

// ---------------------------------------------------------------------
// I/O ports
// ---------------------------------------------------------------------

export interface ISourceFile {
	/** Repo-relative, forward-slashed. */
	readonly path: string;
	readonly text: string;
}

export type IListTrackedFiles = (
	cwd: string,
	pathspecs: readonly string[],
) => readonly string[];

export type IReadTextFile = (cwd: string, path: string) => string;

export const gitListTrackedFiles: IListTrackedFiles = (cwd, pathspecs) => {
	const res = spawnSync('git', ['ls-files', '--', ...pathspecs], {
		cwd,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	if (res.status !== 0) return [];
	return res.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
};

export const readWorkspaceFile: IReadTextFile = (cwd, path) => {
	try {
		return readFileSync(join(cwd, path), 'utf8');
	} catch {
		return '';
	}
};

// ---------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------

/** Test code: a spec/test file, or anything under a `tests/` tree. */
export const isTestFile = (path: string): boolean =>
	path.endsWith('.spec.ts') ||
	path.endsWith('.spec.tsx') ||
	path.endsWith('.test.ts') ||
	path.endsWith('.test.tsx') ||
	path.includes('/tests/') ||
	path.startsWith('tests/');

/**
 * End-of-declaration markers. The window above a declaration runs into
 * whatever follows it — including the next symbol's docblock — so the
 * head is cut at the first of these. Without the cut, a plain constant
 * declared above a documented builder inherits its neighbour's types
 * and is reported as a builder itself.
 */
export const DECLARATION_END_MARKERS = [';', '=> {', '=> ({', ') {'] as const;

/** The declaration head: everything up to the first end marker. */
export const declarationHeadOf = (window: string): string => {
	let end = window.length;
	for (const marker of DECLARATION_END_MARKERS) {
		const index = window.indexOf(marker);
		if (index !== -1 && index < end) end = index;
	}
	return window.slice(0, end);
};

const EXPORT_DECLARATION =
	/^export\s+(?:declare\s+)?(?:async\s+)?(?:const|function)\s+([A-Za-z0-9_$]+)/;

/**
 * Every exported declaration in `file` whose declaration head mentions
 * `IToolRegistration` — that is, every tool-registration builder.
 *
 * Head-window matching rather than a full parse: a builder's return
 * type is always within a few lines of its `export const` line, and a
 * lint that needs a TypeScript program to run is a lint nobody runs.
 */
export const findToolBuilders = (file: ISourceFile): readonly string[] => {
	if (!PLUGIN_SRC_PATTERN.test(file.path)) return [];
	if (isTestFile(file.path)) return [];
	const lines = file.text.split('\n');
	const found: string[] = [];
	for (const [index, line] of lines.entries()) {
		const match = EXPORT_DECLARATION.exec(line);
		if (match === null) continue;
		const symbol = match[1];
		if (symbol === undefined) continue;
		const head = lines
			.slice(index, index + DECLARATION_WINDOW_LINES)
			.join('\n');
		if (declarationHeadOf(head).includes(REGISTRATION_TYPE))
			found.push(symbol);
	}
	return found;
};

/** Whole-word reference to `symbol` anywhere in `text`. */
export const referencesSymbol = (text: string, symbol: string): boolean =>
	new RegExp(`\\b${symbol.replaceAll('$', '\\$')}\\b`).test(text);

const isCommentLine = (line: string): boolean => {
	const trimmed = line.trimStart();
	return (
		trimmed.startsWith('//') ||
		trimmed.startsWith('*') ||
		trimmed.startsWith('/*')
	);
};

/**
 * Does the declaring file itself USE the symbol — beyond declaring it?
 *
 * This is what separates a genuinely orphaned builder from one that a
 * same-file aggregator composes (`buildTriageToolRegistrations` returns
 * `[buildTriageRunRegistration(options), ...]`): the aggregator is the
 * thing the plugin registers, and the parts are reached through it.
 * x00533's own case had exactly one reference in `src` — the
 * declaration line — and nothing else.
 *
 * Comment lines do not count: a builder mentioned only in prose is
 * still a builder nobody calls.
 */
export const usedWithinOwnFile = (file: ISourceFile, symbol: string): boolean =>
	file.text
		.split('\n')
		.filter((line) => !isCommentLine(line))
		.filter((line) => EXPORT_DECLARATION.exec(line)?.[1] !== symbol)
		.some((line) => referencesSymbol(line, symbol));

export interface IUnregisteredToolOffender {
	readonly symbol: string;
	readonly file: string;
	/** Test files that reference it — the evidence it is tested-only. */
	readonly testReferences: readonly string[];
}

export interface IUnregisteredToolsResult {
	readonly offenders: readonly IUnregisteredToolOffender[];
	readonly scannedBuilders: number;
	/** Exclusions that were applied (reason non-empty and matched). */
	readonly appliedExclusions: readonly string[];
	readonly ok: boolean;
}

const exclusionKey = (symbol: string, file: string): string =>
	`${file}#${symbol}`;

/**
 * Pure over the corpus. A builder is an offender when no NON-test file
 * other than its own references it.
 */
export const findUnregisteredToolBuilders = (
	files: readonly ISourceFile[],
	exclusions: readonly IUnregisteredToolExclusion[] = UNREGISTERED_TOOL_EXCLUSIONS,
): IUnregisteredToolsResult => {
	const excluded = new Set(
		exclusions
			.filter((entry) => entry.reason.trim().length > 0)
			.map((entry) => exclusionKey(entry.symbol, entry.file)),
	);
	const applied: string[] = [];
	const offenders: IUnregisteredToolOffender[] = [];
	let scannedBuilders = 0;

	for (const file of files) {
		for (const symbol of findToolBuilders(file)) {
			scannedBuilders += 1;
			const key = exclusionKey(symbol, file.path);
			if (excluded.has(key)) {
				applied.push(key);
				continue;
			}
			const testReferences: string[] = [];
			let referencedInProduction = usedWithinOwnFile(file, symbol);
			if (referencedInProduction) continue;
			for (const other of files) {
				if (other.path === file.path) continue;
				if (!referencesSymbol(other.text, symbol)) continue;
				if (isTestFile(other.path)) testReferences.push(other.path);
				else {
					referencedInProduction = true;
					break;
				}
			}
			if (referencedInProduction) continue;
			offenders.push({
				symbol,
				file: file.path,
				testReferences: [...testReferences].sort(),
			});
		}
	}

	offenders.sort((a, b) =>
		a.file === b.file
			? a.symbol.localeCompare(b.symbol)
			: a.file.localeCompare(b.file),
	);
	return {
		offenders,
		scannedBuilders,
		appliedExclusions: applied.sort(),
		ok: offenders.length === 0,
	};
};

export const formatReport = (result: IUnregisteredToolsResult): string => {
	if (result.ok) {
		return `✓ unregistered-tools: ${result.scannedBuilders} tool builder(s) under plugins/*/src, every one of them wired into a plugin.`;
	}
	return [
		`✖ unregistered-tools: ${result.offenders.length} tool builder(s) referenced only by tests:`,
		...result.offenders.flatMap((offender) => [
			`  ${offender.file} — ${offender.symbol}`,
			offender.testReferences.length === 0
				? '    referenced nowhere outside its own file'
				: `    only test references: ${offender.testReferences.join(', ')}`,
		]),
		'  A builder nobody registers is not a feature: the tool never',
		'  reaches the MCP surface, and its spec stays green because it',
		'  calls the builder directly.',
		'  fix: wire it into its plugin’s `tools: [...]` array, add a test',
		'  that asserts the REGISTRATION (not the builder), or add a',
		'  justified entry to UNREGISTERED_TOOL_EXCLUSIONS in',
		'  tools/scripts/lint/unregistered-tools.script.ts.',
	].join('\n');
};

/** Loads the corpus through the injected ports. */
export const loadCorpus = (
	cwd: string,
	listTrackedFiles: IListTrackedFiles = gitListTrackedFiles,
	readTextFile: IReadTextFile = readWorkspaceFile,
): readonly ISourceFile[] =>
	listTrackedFiles(cwd, CORPUS_PATHSPECS)
		.filter((path) => path.endsWith('.ts') || path.endsWith('.tsx'))
		.map((path) => ({ path, text: readTextFile(cwd, path) }));

/** CLI shell. Returns the process exit code. */
export const main = (
	cwd: string = repoRoot(),
	listTrackedFiles: IListTrackedFiles = gitListTrackedFiles,
	readTextFile: IReadTextFile = readWorkspaceFile,
): number => {
	const result = findUnregisteredToolBuilders(
		loadCorpus(cwd, listTrackedFiles, readTextFile),
	);
	process.stdout.write(`${formatReport(result)}\n`);
	return result.ok ? 0 : 1;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) process.exit(main());
