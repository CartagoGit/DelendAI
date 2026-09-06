#!/usr/bin/env bun
/**
 * state-engine-coverage.script.ts — q00019 meta audit.
 *
 * Hermetic scan of the SQLite state-engine surface. The script only
 * reads workspace files and reports where the contract is referenced.
 * It exits non-zero when a fail-closed reason appears anywhere in the
 * audited surface but is not handled by the SQLite driver layer.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const SQLITE_IMPORTS = [
	'bun:sqlite',
	'better-sqlite3',
	'node:fs',
	'node:fs/promises',
] as const;

const REGISTRY_METHODS = [
	'rebuild',
	'hydrate',
	'incremental',
	'snapshot',
	'fork',
	'discard',
	'record',
] as const;

const FAIL_CLOSED_REASONS = [
	'state_store_unavailable',
	'state_store_corrupt',
	'state_store_schema_unsupported',
	'state_store_stale',
] as const;

const ARTIFACT_SYMBOLS = ['IArtifactStore', 'IDerivationEngine'] as const;
const DRIFT_SYMBOL = 'TDriftDirection';

const TEXT_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.mts',
	'.cts',
	'.json',
	'.md',
]);

const SKIP_DIRS = new Set([
	'dist',
	'coverage',
	'node_modules',
	'.git',
	'.turbo',
	'.cache',
]);

const IMPORT_RE =
	/(?:from\s+|import\s+|require\(\s*)['"]([^'"]+)['"]/g;
const REGISTRY_CALL_RE =
	/\.\s*(rebuild|hydrate|incremental|snapshot|fork|discard|record)\s*\(/g;

export interface IStateEngineReference {
	readonly layer: string;
	readonly file: string;
	readonly line: number;
	readonly token: string;
	readonly kind:
		| 'sqlite-import'
		| 'registry-call'
		| 'fail-closed-reason'
		| 'drift'
		| 'artifact';
	readonly text: string;
}

export interface IStateEngineLayerSummary {
	readonly layer: string;
	readonly files: number;
	readonly sqliteRefs: number;
	readonly registryCalls: number;
	readonly failClosedReasons: number;
	readonly drift: number;
	readonly artifacts: number;
}

export interface IStateEngineCoverageReport {
	readonly summaries: readonly IStateEngineLayerSummary[];
	readonly references: readonly IStateEngineReference[];
	readonly mismatches: readonly string[];
	readonly outsideDriverSqliteImports: readonly IStateEngineReference[];
	readonly driverHandledReasons: readonly string[];
	readonly referencedReasons: readonly string[];
}

interface ILayerRoot {
	readonly layer: string;
	readonly relDir: string;
}

const isTextFile = (name: string): boolean => TEXT_EXTENSIONS.has(extname(name));

const walkFiles = (absDir: string): string[] => {
	if (!existsSync(absDir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(absDir)) {
		if (SKIP_DIRS.has(entry)) continue;
		const absPath = join(absDir, entry);
		const stat = statSync(absPath);
		if (stat.isDirectory()) {
			out.push(...walkFiles(absPath));
			continue;
		}
		if (stat.isFile() && isTextFile(entry)) out.push(absPath);
	}
	return out.sort();
};

const discoverLayers = (root: string): readonly ILayerRoot[] => {
	const layers: ILayerRoot[] = [
		{ layer: 'packages/state', relDir: 'packages/state' },
		{ layer: 'packages/state-sqlite', relDir: 'packages/state-sqlite' },
	];
	const pluginsRoot = join(root, 'plugins');
	if (!existsSync(pluginsRoot)) return layers;
	for (const pluginName of readdirSync(pluginsRoot).sort()) {
		const relDir = `plugins/${pluginName}/src/lib/state`;
		if (existsSync(join(root, relDir))) {
			layers.push({ layer: `plugins/${pluginName}`, relDir });
		}
	}
	return layers;
};

const findReferencesInLine = (
	layer: string,
	file: string,
	lineNumber: number,
	line: string,
): IStateEngineReference[] => {
	const out: IStateEngineReference[] = [];
	IMPORT_RE.lastIndex = 0;
	let importMatch: RegExpExecArray | null;
	while ((importMatch = IMPORT_RE.exec(line)) !== null) {
		const specifier = importMatch[1] as (typeof SQLITE_IMPORTS)[number] | undefined;
		if (specifier !== undefined && SQLITE_IMPORTS.includes(specifier)) {
			out.push({
				layer,
				file,
				line: lineNumber,
				token: specifier,
				kind: 'sqlite-import',
				text: line.trim(),
			});
		}
	}

	REGISTRY_CALL_RE.lastIndex = 0;
	let callMatch: RegExpExecArray | null;
	while ((callMatch = REGISTRY_CALL_RE.exec(line)) !== null) {
		const method = callMatch[1] as (typeof REGISTRY_METHODS)[number] | undefined;
		if (method !== undefined) {
			out.push({
				layer,
				file,
				line: lineNumber,
				token: method,
				kind: 'registry-call',
				text: line.trim(),
			});
		}
	}

	for (const reason of FAIL_CLOSED_REASONS) {
		if (line.includes(reason)) {
			out.push({
				layer,
				file,
				line: lineNumber,
				token: reason,
				kind: 'fail-closed-reason',
				text: line.trim(),
			});
		}
	}

	if (line.includes(DRIFT_SYMBOL)) {
		out.push({
			layer,
			file,
			line: lineNumber,
			token: DRIFT_SYMBOL,
			kind: 'drift',
			text: line.trim(),
		});
	}

	for (const symbol of ARTIFACT_SYMBOLS) {
		if (line.includes(symbol)) {
			out.push({
				layer,
				file,
				line: lineNumber,
				token: symbol,
				kind: 'artifact',
				text: line.trim(),
			});
		}
	}

	return out;
};

export const scanStateEngineCoverage = (
	root: string = repoRoot(),
): IStateEngineCoverageReport => {
	const layers = discoverLayers(root);
	const references: IStateEngineReference[] = [];
	const summaries: IStateEngineLayerSummary[] = [];

	for (const layer of layers) {
		const absDir = join(root, layer.relDir);
		const files = walkFiles(absDir);
		const layerRefs: IStateEngineReference[] = [];
		for (const absFile of files) {
			const relFile = relative(root, absFile);
			const body = readFileSync(absFile, 'utf8');
			for (const [index, line] of body.split('\n').entries()) {
				layerRefs.push(
					...findReferencesInLine(layer.layer, relFile, index + 1, line),
				);
			}
		}
		references.push(...layerRefs);
		summaries.push({
			layer: layer.layer,
			files: files.length,
			sqliteRefs: layerRefs.filter((ref) => ref.kind === 'sqlite-import').length,
			registryCalls: layerRefs.filter((ref) => ref.kind === 'registry-call').length,
			failClosedReasons: layerRefs.filter(
				(ref) => ref.kind === 'fail-closed-reason',
			).length,
			drift: layerRefs.filter((ref) => ref.kind === 'drift').length,
			artifacts: layerRefs.filter((ref) => ref.kind === 'artifact').length,
		});
	}

	const driverHandledReasons = [
		...new Set(
			references
				.filter(
					(ref) =>
						ref.layer === 'packages/state-sqlite' &&
						ref.kind === 'fail-closed-reason',
				)
				.map((ref) => ref.token),
		),
	].sort();

	const referencedReasons = [
		...new Set(
			references
				.filter((ref) => ref.kind === 'fail-closed-reason')
				.map((ref) => ref.token),
		),
	].sort();

	const mismatches = referencedReasons
		.filter((reason) => !driverHandledReasons.includes(reason))
		.map(
			(reason) =>
				`fail-closed reason not handled by driver: ${reason}`,
		);

	const outsideDriverSqliteImports = references.filter(
		(ref) =>
			ref.kind === 'sqlite-import' &&
			ref.token === 'bun:sqlite' &&
			ref.layer !== 'packages/state-sqlite',
	);

	return {
		summaries,
		references,
		mismatches,
		outsideDriverSqliteImports,
		driverHandledReasons,
		referencedReasons,
	};
};

const renderTable = (summaries: readonly IStateEngineLayerSummary[]): string => {
	const lines = [
		'| Layer | Files | SQLite refs | IStateRegistry calls | Fail-closed reasons | Drift | Artifacts |',
		'|-------|-------|-------------|----------------------|---------------------|-------|-----------|',
	];
	for (const summary of summaries) {
		lines.push(
			`| ${summary.layer} | ${summary.files} | ${summary.sqliteRefs} | ${summary.registryCalls} | ${summary.failClosedReasons} | ${summary.drift} | ${summary.artifacts} |`,
		);
	}
	return lines.join('\n');
};

const renderReferences = (
	title: string,
	references: readonly IStateEngineReference[],
): string => {
	if (references.length === 0) return `${title}: none`;
	return [
		title,
		...references.map(
			(ref) => `- ${ref.file}:${ref.line} [${ref.layer}] ${ref.token} :: ${ref.text}`,
		),
	].join('\n');
};

export const formatStateEngineCoverageReport = (
	report: IStateEngineCoverageReport,
): string => {
	const sections = [
		renderTable(report.summaries),
		renderReferences(
			'\nSQLite imports',
			report.references.filter((ref) => ref.kind === 'sqlite-import'),
		),
		renderReferences(
			'\nIStateRegistry call sites',
			report.references.filter((ref) => ref.kind === 'registry-call'),
		),
		renderReferences(
			'\nFail-closed reasons',
			report.references.filter((ref) => ref.kind === 'fail-closed-reason'),
		),
		renderReferences(
			'\nTDriftDirection references',
			report.references.filter((ref) => ref.kind === 'drift'),
		),
		renderReferences(
			'\nArtifact / derivation references',
			report.references.filter((ref) => ref.kind === 'artifact'),
		),
	];

	if (report.outsideDriverSqliteImports.length > 0) {
		sections.push(
			renderReferences(
				'\nimport of bun:sqlite outside state-sqlite',
				report.outsideDriverSqliteImports,
			),
		);
	}

	if (report.mismatches.length > 0) {
		sections.push('\nDriver mismatches');
		for (const mismatch of report.mismatches) sections.push(`- ${mismatch}`);
	}

	return `${sections.join('\n')}\n`;
};

const main = (): number => {
	const report = scanStateEngineCoverage(repoRoot());
	process.stdout.write(formatStateEngineCoverageReport(report));
	return report.mismatches.length > 0 ? 1 : 0;
};

if (import.meta.main) process.exit(main());