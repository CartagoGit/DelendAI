#!/usr/bin/env bun
/**
 * detail-levels-coverage.script.ts — f00271 S2.
 *
 * Warning-only structural coverage snapshot for the transversal
 * `detail: compact | normal | full` contract. The rollout is gradual, so
 * this script judges every `server.registerTool(...)` registration on its
 * own and reports it as adopted or pending instead of failing the build.
 * Validation runs it as an advisory step so the adoption count stays
 * visible.
 *
 * A registration is adopted when it has all three:
 *
 *   - vocabulary: the file speaks the detail levels, through core's
 *     `DETAIL_LEVELS` or a literal `z.enum(['compact', 'normal', 'full'])`;
 *   - input: its input schema carries a `detail:` field typed by such an
 *     enum, inline, through a local schema, or through a schema imported
 *     from a sibling module (followed one import deep);
 *   - projection: it shapes its answer by level, through `projectDetail`
 *     or a handler that reads the requested `detail`, directly or via a
 *     local helper.
 *
 * Several tools adopted the contract before `DETAIL_LEVELS` existed and
 * kept their own enum, or read `detail` from a shared read contract.
 * Recognising only the shared constant reported those as pending, so the
 * count under-stated real adoption.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const PLUGINS_ROOT = 'plugins';
const TOOL_FILE = /\/src\/lib\/tools\/.+\.ts$/;
const REGISTER_TOOL = /server\.registerTool\(/g;
const DETAIL_LEVELS_ENUM = String.raw`z\.enum\(\s*DETAIL_LEVELS\s*\)`;
const DETAIL_LITERAL_ENUM = String.raw`z\.enum\(\s*\[\s*'compact'\s*,\s*'normal'\s*,\s*'full'\s*\]\s*\)`;
const DETAIL_ENUM = new RegExp(`${DETAIL_LEVELS_ENUM}|${DETAIL_LITERAL_ENUM}`);
const DETAIL_VOCABULARY = new RegExp(
	String.raw`\bDETAIL_LEVELS\b|${DETAIL_LITERAL_ENUM}`,
);
const PROJECT_DETAIL = /\bprojectDetail\s*\(/;
const READS_DETAIL = /\b(?:args|input|params|data)\??\.detail\b/;
const RELATIVE_IMPORT =
	/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/g;

export const MISSING_VOCABULARY =
	'missing detail vocabulary (DETAIL_LEVELS or a compact|normal|full enum)';
export const MISSING_INPUT =
	'missing detail input (a detail: field typed by a compact|normal|full enum)';
export const MISSING_PROJECTION =
	'missing detail projection (projectDetail(...) or a handler that reads detail)';

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

interface IModuleDetailFacts {
	/** Consts typed as a detail enum (`const X = z.enum(DETAIL_LEVELS)`). */
	readonly enumNames: ReadonlySet<string>;
	/** Consts whose definition carries a `detail:` field typed by one. */
	readonly schemaNames: ReadonlySet<string>;
	readonly speaksDetail: boolean;
}

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
	const matcher = /const\s+([A-Za-z0-9_$]+)\s*=/g;
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
				if (
					new RegExp(`\\b${escapeName(known)}\\s*\\(`).test(statement)
				) {
					names.add(name);
					changed = true;
					break;
				}
			}
		}
	}
	return names;
};

const escapeName = (name: string): string => name.replace(/\$/g, '\\$');

const hasNamedReference = (
	block: string,
	names: ReadonlySet<string>,
	prefix = '',
): boolean => {
	for (const name of names) {
		const matcher = new RegExp(`${prefix}\\b${escapeName(name)}\\b`);
		if (matcher.test(block)) return true;
	}
	return false;
};

/** `detail:` typed by an inline detail enum or one of the given names. */
const detailFieldPattern = (enumNames: ReadonlySet<string>): RegExp => {
	const alternatives = [
		DETAIL_LEVELS_ENUM,
		DETAIL_LITERAL_ENUM,
		...[...enumNames].map((name) => `\\b${escapeName(name)}\\b`),
	];
	return new RegExp(`\\bdetail\\s*:\\s*(?:${alternatives.join('|')})`);
};

/** What one module says about detail, given the enum names it can see. */
const moduleDetailFacts = (
	text: string,
	visibleEnums: ReadonlySet<string> = new Set(),
): IModuleDetailFacts => {
	const statements = collectConstStatements(text);
	const enumNames = new Set([
		...visibleEnums,
		...collectConstNames(statements, DETAIL_ENUM),
	]);
	const schemaNames = collectConstNames(
		statements,
		detailFieldPattern(enumNames),
	);
	return {
		enumNames,
		schemaNames,
		speaksDetail: DETAIL_VOCABULARY.test(text) || enumNames.size > 0,
	};
};

/** `{ a, type b, c as d }` → pairs of exported name and local alias. */
const parseImportedNames = (
	clause: string,
): readonly { readonly exported: string; readonly local: string }[] =>
	clause
		.split(',')
		.map((part) => part.trim().replace(/^type\s+/, ''))
		.filter((part) => part.length > 0)
		.map((part) => {
			const [exported = part, local = exported] = part
				.split(/\s+as\s+/)
				.map((piece) => piece.trim());
			return { exported, local };
		});

const readModule = async (
	fromFile: string,
	specifier: string,
	cache: Map<string, string | null>,
): Promise<string | null> => {
	const base = join(dirname(fromFile), specifier);
	for (const candidate of [
		base.endsWith('.ts') ? base : `${base}.ts`,
		join(base, 'index.ts'),
	]) {
		if (cache.has(candidate)) {
			const cached = cache.get(candidate);
			if (cached !== null && cached !== undefined) return cached;
			continue;
		}
		try {
			const text = await readFile(candidate, 'utf8');
			cache.set(candidate, text);
			return text;
		} catch {
			cache.set(candidate, null);
		}
	}
	return null;
};

/**
 * Detail enums and schemas a tool file imports from sibling modules,
 * under the names the tool file uses for them. One import deep: a
 * contract that re-exports another contract's schema is not followed.
 */
const importedDetailFacts = async (
	file: string,
	text: string,
	cache: Map<string, string | null>,
): Promise<IModuleDetailFacts> => {
	const enumNames = new Set<string>();
	const schemaNames = new Set<string>();
	let speaksDetail = false;
	for (const match of text.matchAll(RELATIVE_IMPORT)) {
		const clause = match[1];
		const specifier = match[2];
		if (clause === undefined || specifier === undefined) continue;
		const source = await readModule(file, specifier, cache);
		if (source === null) continue;
		const facts = moduleDetailFacts(source);
		for (const { exported, local } of parseImportedNames(clause)) {
			if (facts.enumNames.has(exported)) {
				enumNames.add(local);
				speaksDetail = true;
			}
			if (facts.schemaNames.has(exported)) {
				schemaNames.add(local);
				speaksDetail = true;
			}
		}
	}
	return { enumNames, schemaNames, speaksDetail };
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

export const detectDetailCoverage = async (
	repoRoot: string = process.cwd(),
): Promise<IDetailCoverageReport> => {
	const files = await walk(join(repoRoot, PLUGINS_ROOT));
	const findings: IDetailCoverageFinding[] = [];
	const adopted: string[] = [];
	const moduleCache = new Map<string, string | null>();
	let scannedTools = 0;
	for (const file of files) {
		const text = await readFile(file, 'utf8');
		const rel = relative(repoRoot, file);
		const toolMatches = [...text.matchAll(REGISTER_TOOL)];
		if (toolMatches.length === 0) continue;
		scannedTools += toolMatches.length;
		const imported = await importedDetailFacts(file, text, moduleCache);
		const local = moduleDetailFacts(text, imported.enumNames);
		const speaksDetail = local.speaksDetail || imported.speaksDetail;
		const detailField = detailFieldPattern(local.enumNames);
		const detailSchemas = new Set([
			...local.schemaNames,
			...imported.schemaNames,
		]);
		const statements = collectConstStatements(text);
		const projectionHelpers = new Set([
			...collectReferencedConstClosure(statements, PROJECT_DETAIL),
			...collectReferencedConstClosure(statements, READS_DETAIL),
		]);
		for (const [index, match] of toolMatches.entries()) {
			const start = match.index ?? 0;
			const end = toolMatches[index + 1]?.index ?? text.length;
			const block = text.slice(start, end);
			const tool = findToolId(text, start, index + 1);
			const reasons: string[] = [];
			if (!speaksDetail) reasons.push(MISSING_VOCABULARY);
			if (
				!detailField.test(block) &&
				!hasNamedReference(block, detailSchemas, 'inputSchema:\\s*')
			) {
				reasons.push(MISSING_INPUT);
			}
			if (
				!PROJECT_DETAIL.test(block) &&
				!READS_DETAIL.test(block) &&
				!hasNamedReference(block, projectionHelpers)
			) {
				reasons.push(MISSING_PROJECTION);
			}
			const label = `${rel}#${tool}`;
			if (reasons.length === 0) adopted.push(label);
			else findings.push({ file: rel, tool, reasons });
		}
	}
	return {
		scannedFiles: files.map((file) => relative(repoRoot, file)),
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
