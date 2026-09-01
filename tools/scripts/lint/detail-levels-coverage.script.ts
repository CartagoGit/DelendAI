#!/usr/bin/env bun
/**
 * detail-levels-coverage.script.ts — f00271 S2.
 *
 * Warning-only structural coverage snapshot for the transversal
 * `detail: compact | normal | full` contract. The rollout is gradual,
 * so this script reports which tool source files already show the shared
 * markers (`DETAIL_LEVELS`, `DetailSchema`, `projectDetail`) instead of
 * failing the build while migration is still in progress.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const PLUGINS_ROOT = 'plugins';
const TOOL_FILE = /\/src\/lib\/tools\/.+\.ts$/;
const REGISTER_TOOL = /server\.registerTool\(/g;
const DETAIL_LEVELS_IMPORT = /\bDETAIL_LEVELS\b/;
const DETAIL_SCHEMA = /const\s+DetailSchema\s*=\s*z\.enum\(DETAIL_LEVELS\)/;
const DETAIL_INPUT = /detail:\s*DetailSchema\.optional\(\)/;
const PROJECT_DETAIL = /\bprojectDetail\s*\(/;

export interface IDetailCoverageFinding {
	readonly file: string;
	readonly tool: string;
	readonly reasons: readonly string[];
}

export interface IDetailCoverageReport {
	readonly scannedFiles: readonly string[];
	readonly scannedTools: number;
	readonly adopted: readonly string[];
	readonly findings: readonly IDetailCoverageFinding[];
}

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);

const TOOL_ID = /id:\s*'([a-z0-9_]+)'/g;

const findStatementEnd = (text: string, start: number): number => {
	let parens = 0;
	let braces = 0;
	let brackets = 0;
	let quote: '"' | "'" | '`' | null = null;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		const next = text[index + 1];
		if (lineComment) {
			if (char === '\n') lineComment = false;
			continue;
		}
		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				index += 1;
			}
			continue;
		}
		if (quote !== null) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}
		if (char === '/' && next === '/') {
			lineComment = true;
			index += 1;
			continue;
		}
		if (char === '/' && next === '*') {
			blockComment = true;
			index += 1;
			continue;
		}
		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(') parens += 1;
		else if (char === ')') parens = Math.max(0, parens - 1);
		else if (char === '{') braces += 1;
		else if (char === '}') braces = Math.max(0, braces - 1);
		else if (char === '[') brackets += 1;
		else if (char === ']') brackets = Math.max(0, brackets - 1);
		else if (
			char === ';' &&
			parens === 0 &&
			braces === 0 &&
			brackets === 0
		) {
			return index + 1;
		}
	}
	return text.length;
};

const collectConstStatements = (text: string): ReadonlyMap<string, string> => {
	const statements = new Map<string, string>();
	const matcher = /const\s+([A-Za-z0-9_]+)\s*=/g;
	for (const match of text.matchAll(matcher)) {
		const name = match[1];
		if (name === undefined) continue;
		const start = match.index ?? 0;
		statements.set(name, text.slice(start, findStatementEnd(text, start)));
	}
	return statements;
};

const collectConstNames = (
	statements: ReadonlyMap<string, string>,
	pattern: RegExp,
): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const [name, statement] of statements) {
		if (pattern.test(statement)) names.add(name);
	}
	return names;
};

const collectReferencedConstClosure = (
	statements: ReadonlyMap<string, string>,
	seedPattern: RegExp,
): ReadonlySet<string> => {
	const names = new Set(collectConstNames(statements, seedPattern));
	let changed = true;
	while (changed) {
		changed = false;
		for (const [name, statement] of statements) {
			if (names.has(name)) continue;
			for (const known of names) {
				if (new RegExp(`\\b${known}\\s*\\(`).test(statement)) {
					names.add(name);
					changed = true;
					break;
				}
			}
		}
	}
	return names;
};

const hasNamedReference = (
	block: string,
	names: ReadonlySet<string>,
	prefix = '',
): boolean => {
	for (const name of names) {
		const matcher = new RegExp(`\\b${prefix}${name}\\b`);
		if (matcher.test(block)) return true;
	}
	return false;
};

const findToolId = (text: string, start: number, ordinal: number): string => {
	const context = text.slice(Math.max(0, start - 600), start);
	const matches = [...context.matchAll(TOOL_ID)];
	const last = matches.at(-1)?.[1];
	return last ?? `tool_${ordinal}`;
};

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'node_modules' && entry.name !== 'dist') {
					stack.push(full);
				}
				continue;
			}
			if (entry.isFile() && TOOL_FILE.test(full)) out.push(full);
		}
	}
	return out.sort();
};

export const detectDetailCoverage =
	async (): Promise<IDetailCoverageReport> => {
		const files = await walk(abs(PLUGINS_ROOT));
		const findings: IDetailCoverageFinding[] = [];
		const adopted: string[] = [];
		let scannedTools = 0;
		for (const file of files) {
			const text = await readFile(file, 'utf8');
			const rel = relative(REPO_ROOT, file);
			const toolMatches = [...text.matchAll(REGISTER_TOOL)];
			if (toolMatches.length === 0) continue;
			scannedTools += toolMatches.length;
			const hasDetailLevels = DETAIL_LEVELS_IMPORT.test(text);
			const hasDetailSchema = DETAIL_SCHEMA.test(text);
			const constStatements = collectConstStatements(text);
			const detailInputSchemas = collectConstNames(
				constStatements,
				DETAIL_INPUT,
			);
			const detailProjectionHelpers = collectReferencedConstClosure(
				constStatements,
				PROJECT_DETAIL,
			);
			for (const [index, match] of toolMatches.entries()) {
				const start = match.index ?? 0;
				const end = toolMatches[index + 1]?.index ?? text.length;
				const block = text.slice(start, end);
				const tool = findToolId(text, start, index + 1);
				const reasons: string[] = [];
				if (!hasDetailLevels) {
					reasons.push('missing DETAIL_LEVELS import/usage');
				}
				if (!hasDetailSchema) {
					reasons.push(
						'missing DetailSchema = z.enum(DETAIL_LEVELS)',
					);
				}
				if (
					!DETAIL_INPUT.test(block) &&
					!hasNamedReference(
						block,
						detailInputSchemas,
						'inputSchema:\\s*',
					)
				) {
					reasons.push(
						'missing detail: DetailSchema.optional() in input schema',
					);
				}
				if (
					!PROJECT_DETAIL.test(block) &&
					!hasNamedReference(block, detailProjectionHelpers)
				) {
					reasons.push('missing projectDetail(...) projection');
				}
				const label = `${rel}#${tool}`;
				if (reasons.length === 0) adopted.push(label);
				else findings.push({ file: rel, tool, reasons });
			}
		}
		return {
			scannedFiles: files.map((file) => relative(REPO_ROOT, file)),
			scannedTools,
			adopted: adopted.sort(),
			findings,
		};
	};

export const formatReport = (report: IDetailCoverageReport): string => {
	const lines = [
		`detail-levels-coverage: ${report.adopted.length} adopted, ${report.findings.length} pending, ${report.scannedTools} tool registrations across ${report.scannedFiles.length} tool files scanned.`,
	];
	if (report.adopted.length > 0) {
		lines.push('', 'adopted:');
		for (const file of report.adopted) lines.push(`  - ${file}`);
	}
	if (report.findings.length > 0) {
		lines.push('', 'pending (warning only):');
		for (const finding of report.findings) {
			lines.push(`  - ${finding.file}#${finding.tool}`);
			for (const reason of finding.reasons) {
				lines.push(`      ${reason}`);
			}
		}
	}
	lines.push('');
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const report = await detectDetailCoverage();
	process.stdout.write(formatReport(report));
	return 0;
};

if (import.meta.main) {
	process.exit(await main());
}
