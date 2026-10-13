#!/usr/bin/env bun
/**
 * no-internal-imports.script.ts — b00238 (Track N / q00006 §50).
 *
 * Enforces the `@internal` naming convention introduced in b00238:
 * any import of a symbol whose name ends with `Internal`, or from the
 * `@delendai/core/_internal` subpath, is permitted ONLY inside
 * `packages/core/**` (where the boundary is documented). Anything
 * outside the core — plugins, clients, apps, tooling — must NOT
 * touch internals.
 *
 * Output is a list of `{ file, line, specifier, kind, reason }`
 * findings; the host integrates this into `bun run validate`.
 *
 * Privacy (R1.1–R1.10): the script reads source files only; never
 * persists file content, never sends bytes anywhere.
 */

import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

const REPO_ROOT = process.cwd();

/**
 * Default scan roots — audit-h3-fix style. Each entry is a
 * workspace-relative path; any directory under it is walked
 * recursively except `node_modules`, `dist`, and `coverage`.
 */
const DEFAULT_SCAN_ROOTS: readonly string[] = [
	'apps/web/src',
	'apps/web/scripts',
	'packages/cli/src',
	'packages/client/src',
	'packages/ui-extension/src',
	'plugins',
	'tools/scripts',
];

/**
 * Subtrees that legitimately touch internals. Each entry is a
 * workspace-relative path prefix.
 *
 * - `tools/scripts/lint/`: the lint scripts ARE the rule (their
 *   fixture strings intentionally reference internal names).
 * - `tools/scripts/inspect/`: same — fixture strings reference
 *   internal API names.
 * - `tools/scripts/compile/`: build pipeline that owns the
 *   `_internal` barrel; legitimate consumer.
 */
const SCAN_EXCLUDE_PREFIXES: readonly string[] = [
	'tools/scripts/lint/',
	'tools/scripts/inspect/',
	'tools/scripts/compile/',
];

const TS_FILE = /\.tsx?$/;

export interface IInternalImportFinding {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	/** Module specifier the violation came from (e.g.
	 *  `@delendai/core/public` or `@delendai/core/_internal/foo`). */
	readonly specifier: string;
	/** For `named-internal` findings, the offending symbol. */
	readonly symbol?: string;
	readonly kind: 'named-internal' | 'subpath-internal';
	readonly reason: string;
}

const SUBPATH_INTERNAL = /["'](@delendai\/core\/_internal[^"']*)["']/;

/** Imports whose specifier is unambiguously a core entry point.
 *  These are the only specifiers the lint inspects for `*Internal`
 *  named imports; everything else is left alone (plugins are free
 *  to define their own `*Internal` helpers). */
const CORE_SPECIFIER_PATTERNS: readonly RegExp[] = [
	/^@delendai\/core\/(?:public|contracts|version|lib|dist)(?:\/|$)/,
	/^(?:\.\.\/)+packages\/core\/src\//,
	/^(?:\.\/)+packages\/core\/src\//,
	/^packages\/core\/src\//,
];

const isCoreSpecifier = (specifier: string): boolean =>
	CORE_SPECIFIER_PATTERNS.some((re) => re.test(specifier));

const NAMED_INTERNAL_FROM_CORE =
	/^[ \t]*(?:import|export)\b[ \t]*\{[^{}]*?\b([A-Za-z_$][\w$]*Internal)\b[^{}]*?\}\s*from\s*["']([^"']+)["']/m;

const NAMED_INTERNAL_TYPE_FROM_CORE =
	/^[ \t]*import\s+type\s*\{[^{}]*?\b([A-Za-z_$][\w$]*Internal)\b[^{}]*?\}\s*from\s*["']([^"']+)["']/m;

const SKIP_LINE_PREFIXES: readonly RegExp[] = [
	/^[ \t]*\/\//, // TS line comment
	/^[ \t]*\*/, // block comment continuation
];

const isCoreOwnedPath = (relPath: string): boolean => {
	const parts = relPath
		.split('/')
		.filter((part) => part !== '' && part !== '.');
	for (let i = 0; i < parts.length - 1; i += 1) {
		if (parts[i] === 'packages' && parts[i + 1] === 'core') return true;
	}
	return false;
};

export const scanText = (
	text: string,
	absPath: string,
	relPath: string,
): IInternalImportFinding[] => {
	if (isCoreOwnedPath(relPath)) return [];

	const findings: IInternalImportFinding[] = [];
	const lines = text.split(/\r?\n/);

	// Pass 1: named `*Internal` imports FROM a core specifier. A
	// plugin defining its OWN `*Internal` helper is not a violation.
	for (let i = 0; i < lines.length; i += 1) {
		const raw = lines[i] ?? '';
		if (SKIP_LINE_PREFIXES.some((re) => re.test(raw))) continue;
		const window = lines.slice(i, i + 8).join('\n');
		const match =
			window.match(NAMED_INTERNAL_FROM_CORE) ??
			window.match(NAMED_INTERNAL_TYPE_FROM_CORE);
		if (!match) continue;
		const name = match[1];
		const specifier = match[2];
		if (name === undefined || specifier === undefined) continue;
		if (!isCoreSpecifier(specifier)) continue;
		findings.push({
			absPath,
			relPath,
			line: i + 1,
			specifier,
			symbol: name,
			kind: 'named-internal',
			reason: `importing ${name} from ${specifier}; ${name} is an internal symbol and must not be consumed outside packages/core/**`,
		});
	}

	// Pass 2: `@delendai/core/_internal` subpath imports. These
	// are unconditional — no matter which file imports them, the
	// subpath is reserved for core use.
	for (let i = 0; i < lines.length; i += 1) {
		const raw = lines[i] ?? '';
		if (SKIP_LINE_PREFIXES.some((re) => re.test(raw))) continue;
		const match = raw.match(SUBPATH_INTERNAL);
		if (!match) continue;
		const specifier = match[1];
		if (specifier === undefined) continue;
		findings.push({
			absPath,
			relPath,
			line: i + 1,
			specifier,
			kind: 'subpath-internal',
			reason: `${specifier} is the internal subpath and must not be consumed outside packages/core/**`,
		});
	}
	return findings;
};

const walk = async (dir: string, out: string[]): Promise<void> => {
	// AUD-D07's adjacent note: this used to declare `entries` via
	// `Awaited<ReturnType<typeof readdir>>` — the un-called generic
	// signature of an overloaded function, which resolves to a WIDER
	// type than the actual call below produces (it includes the
	// `Buffer`-returning overload). That widened `entry.name` type made
	// `name === 'node_modules'` etc. always false against a `string`
	// literal, so the walker silently descended into `node_modules`.
	// Letting TS infer `entries` from the real call (with
	// `withFileTypes: true` and no `encoding` override) pins `name` to
	// `string`, so the comparisons are real again.
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const name = entry.name;
			if (
				name === 'node_modules' ||
				name === 'dist' ||
				name === 'coverage'
			)
				continue;
			const abs = join(dir, name);
			if (entry.isDirectory()) {
				await walk(abs, out);
				continue;
			}
			if (entry.isFile() && TS_FILE.test(name)) out.push(abs);
		}
	} catch {
		return;
	}
};

export const detectInternalImports = async (
	root: string,
): Promise<IInternalImportFinding[]> => {
	const absRoot = isAbsolute(root) ? root : join(REPO_ROOT, root);
	const files: string[] = [];
	await walk(absRoot, files);
	const findings: IInternalImportFinding[] = [];
	for (const abs of files) {
		const rel = relative(REPO_ROOT, abs).split(sep).join('/');
		if (SCAN_EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
			continue;
		}
		const text = await readFile(abs, 'utf8');
		findings.push(...scanText(text, abs, rel));
	}
	return findings;
};

export const detectInternalImportsAcrossRoots = async (
	roots: readonly string[] = DEFAULT_SCAN_ROOTS,
): Promise<IInternalImportFinding[]> => {
	const all: IInternalImportFinding[] = [];
	for (const root of roots) {
		all.push(...(await detectInternalImports(root)));
	}
	return all;
};

export const formatReport = (
	findings: readonly IInternalImportFinding[],
): string => {
	if (findings.length === 0) return 'no-internal-imports: 0 violations.';
	const lines: string[] = [];
	lines.push(`no-internal-imports: ${findings.length} violation(s).`);
	lines.push('');
	lines.push('| file | line | kind | specifier | symbol | reason |');
	lines.push('| --- | --- | --- | --- | --- | --- |');
	for (const f of findings) {
		const symbol = f.symbol ?? '—';
		lines.push(
			`| ${f.relPath} | ${f.line} | ${f.kind} | \`${f.specifier}\` | ${symbol} | ${f.reason} |`,
		);
	}
	return lines.join('\n');
};

const main = async (): Promise<void> => {
	const positional = process.argv.slice(2).filter((a) => !a.startsWith('-'));
	const findings = positional.length
		? await detectInternalImportsAcrossRoots(
				positional.length === 1 ? positional : positional,
			)
		: await detectInternalImportsAcrossRoots();
	const report = formatReport(findings);
	process.stdout.write(`${report}\n`);
	process.exit(findings.length === 0 ? 0 : 1);
};

if (
	import.meta.main === true ||
	process.argv[1]?.endsWith('no-internal-imports.script.ts')
) {
	main().catch((err: unknown) => {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`no-internal-imports: ${message}\n`);
		process.exit(2);
	});
}
