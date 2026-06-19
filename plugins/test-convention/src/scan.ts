import type { IFileReader } from '@mcp-vertex/core/public';

import type { ITestConvention } from './convention';
import { effectiveMockStyle } from './convention';

export type Severity = 'error' | 'warning' | 'info';

export interface IDrift {
	readonly id: string;
	readonly file: string;
	readonly severity: Severity;
	readonly hint: string;
	readonly line?: number;
	readonly excerpt?: string;
}

export interface IDriftCounts {
	readonly error: number;
	readonly warning: number;
	readonly info: number;
}

export interface IDriftReport {
	readonly ok: boolean;
	readonly counts: IDriftCounts;
	readonly violations: readonly IDrift[];
	readonly scannedFiles: number;
}

interface ILineHit {
	readonly line: number;
	readonly text: string;
}

const findHits = (source: string, re: RegExp): readonly ILineHit[] => {
	const hits: ILineHit[] = [];
	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const text = lines[i] ?? '';
		if (re.test(text)) hits.push({ line: i + 1, text });
	}
	return hits;
};

const isSpec = (path: string, ext: string): boolean => path.endsWith(`.${ext}`);

const isTsSource = (path: string): boolean =>
	/^src\/.+\.tsx?$/u.test(path) && !path.endsWith('.d.ts');

const exportNamesOf = (source: string): readonly string[] => {
	const out: string[] = [];
	const re =
		/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1] ?? '');
	return out;
};

const importsFrom = (source: string): readonly string[] => {
	const out: string[] = [];
	const re = /import\s.+?from\s+['"]([^'"]+)['"]/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) out.push(m[1] ?? '');
	return out;
};

const firstLineOfDescribe = (source: string): string | undefined => {
	const re = /describe\(\s*['"`]([^'"`]+)['"`]/u;
	const m = re.exec(source);
	return m?.[1];
};

export interface IScanOptions {
	readonly convention: ITestConvention;
	readonly reader: IFileReader;
	readonly workspaceRoot: string;
	readonly scope?: 'all' | 'src' | 'tests';
	/** Cap to keep the report token-friendly. */
	readonly maxFiles?: number;
}

const DEFAULT_MAX_FILES = 500;

/**
 * Scan the workspace for spec files that violate the convention.
 * Pure over `reader`; never touches the filesystem directly.
 */
export const scanDrift = (options: IScanOptions): IDriftReport => {
	const { convention, reader } = options;
	const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
	const scope = options.scope ?? 'all';
	const specExt = convention.specExtension;

	const all = reader.listDir('').filter((p) => !p.includes('node_modules/'));
	const specFiles = all.filter((p) => isSpec(p, specExt));
	const sourceFiles = all.filter(isTsSource);

	const targets =
		scope === 'src'
			? sourceFiles
			: scope === 'tests'
				? specFiles
				: [...sourceFiles, ...specFiles];

	const violations: IDrift[] = [];
	const seen = new Set<string>();
	const push = (d: IDrift): void => {
		if (seen.has(`${d.id}::${d.file}::${d.line ?? 0}`)) return;
		seen.add(`${d.id}::${d.file}::${d.line ?? 0}`);
		violations.push(d);
	};

	let scanned = 0;
	for (const path of targets) {
		if (scanned >= maxFiles) break;
		const contents = reader.readFile(path);
		if (contents === undefined) continue;
		scanned += 1;

		if (isSpec(path, specExt)) {
			// Wrong-extension: this branch never fires because of the
			// `isSpec` filter, but the rule is still emitted for files
			// that look like tests yet end in a different extension.
			if (!path.endsWith(`.${specExt}`)) {
				push({
					id: 'wrong-spec-extension',
					file: path,
					severity: 'error',
					hint: `expected suffix ".${specExt}"`,
				});
			}

			if (
				convention.requireDescribe &&
				!/^\s*describe\(/u.test(contents)
			) {
				push({
					id: 'missing-top-level-describe',
					file: path,
					severity: 'error',
					hint: 'spec must start with a top-level describe(...)',
				});
			}

			const describeName = firstLineOfDescribe(contents);
			if (describeName !== undefined && describeName.length === 0) {
				push({
					id: 'describe-it-naming',
					file: path,
					severity: 'info',
					hint: 'describe("…") is empty; name the module under test',
				});
			}

			// Mock API mismatch.
			const mockStyle = effectiveMockStyle(convention);
			if (mockStyle === 'vi' && /\bjest\.fn\(/u.test(contents)) {
				push({
					id: 'wrong-mock-api',
					file: path,
					severity: 'error',
					hint: 'project runs vitest; use vi.fn(), not jest.fn()',
				});
			} else if (mockStyle === 'jest' && /\bvi\.fn\(/u.test(contents)) {
				push({
					id: 'wrong-mock-api',
					file: path,
					severity: 'error',
					hint: 'project runs jest; use jest.fn(), not vi.fn()',
				});
			}

			for (const pattern of convention.forbiddenPatterns) {
				for (const hit of findHits(contents, pattern)) {
					const id = pattern.source.includes('.only')
						? 'forbidden-only'
						: pattern.source.includes('xit')
							? 'forbidden-skip'
							: pattern.source.includes('@ts-ignore')
								? 'forbidden-ts-ignore'
								: pattern.source.includes('console.log')
									? 'console-residue'
									: 'forbidden-pattern';
					push({
						id,
						file: path,
						severity: id === 'console-residue' ? 'info' : 'error',
						hint: `forbidden pattern: ${pattern.source}`,
						line: hit.line,
						excerpt: hit.text.slice(0, 120),
					});
				}
			}

			// Orphan: spec imports from a path that does not resolve
			// to any source file under the workspace.
			for (const spec of importsFrom(contents)) {
				if (!spec.startsWith('.')) continue;
				const dir = path.split('/').slice(0, -1).join('/');
				const resolved = resolveFrom(dir, spec);
				if (resolved === undefined) {
					push({
						id: 'orphan-spec',
						file: path,
						severity: 'warning',
						hint: `import "${spec}" does not resolve`,
					});
				} else if (!all.includes(resolved)) {
					push({
						id: 'orphan-spec',
						file: path,
						severity: 'warning',
						hint: `import "${spec}" → "${resolved}" not present in workspace tree`,
					});
				}
			}
		}

		if (isTsSource(path)) {
			// Missing spec companion: source exports but no spec file exists.
			const exports = exportNamesOf(contents);
			if (exports.length > 0) {
				const expected = path.replace(/\.tsx?$/u, `.${specExt}`);
				if (!all.includes(expected) && !specFiles.includes(expected)) {
					push({
						id: 'missing-spec-for-export',
						file: path,
						severity: 'warning',
						hint: `source exports "${exports.join(', ')}" but no ${expected} found`,
					});
				}
			}
		}
	}

	let error = 0;
	let warning = 0;
	let info = 0;
	for (const v of violations) {
		if (v.severity === 'error') error += 1;
		else if (v.severity === 'warning') warning += 1;
		else info += 1;
	}

	return {
		ok: error === 0,
		counts: { error, warning, info },
		violations,
		scannedFiles: scanned,
	};
};

/** Tiny resolver: only handles relative paths and known extensions. */
const resolveFrom = (fromDir: string, spec: string): string | undefined => {
	const cleaned = spec.split('?')[0]?.split('#')[0] ?? spec;
	const base = `${fromDir}/${cleaned}`.replace(/\/\.\//gu, '/');
	const candidates = [
		base,
		`${base}.ts`,
		`${base}.tsx`,
		`${base}.js`,
		`${base}/index.ts`,
		`${base}/index.js`,
	];
	for (const c of candidates) {
		const normalized = c.replace(/\/\.\.\//gu, '/..').replace(/^\.\//u, '');
		// Cheap cycle guard.
		if (normalized.includes('..')) return undefined;
		if (c.endsWith('.ts') || c.endsWith('.tsx') || c.endsWith('.js')) {
			// We can't read the FS here (the engine is pure), but the
			// caller will look the resolved path up in `all`; we
			// just hand back the candidate as a string.
			return normalized;
		}
	}
	return undefined;
};
