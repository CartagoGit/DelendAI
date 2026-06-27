#!/usr/bin/env bun
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const SKIP_DIRS: ReadonlySet<string> = new Set([
	'node_modules',
	'dist',
	'build',
	'.git',
	'.cache',
	'.worktrees',
	'__tests__',
]);

export interface IEphemeralPathViolation {
	readonly file: string;
	readonly line: number;
	readonly token: string;
	readonly kind:
		| 'tmpdir-ref'
		| 'mkdtemp-tmpdir'
		| 'tmp-write'
		| 'homedir-write';
}

const toRelPosix = (root: string, abs: string): string =>
	relative(root, abs).split('\\').join('/');

const replacePreservingLines = (text: string): string =>
	text.replace(/[^\n]/g, ' ');

const stripComments = (source: string): string =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, (match) => replacePreservingLines(match))
		.replace(/(^|[^:])\/\/.*$/gm, (match, prefix: string) => {
			const body = match.slice(prefix.length);
			return prefix + replacePreservingLines(body);
		});

const lineNumberAt = (source: string, index: number): number =>
	source.slice(0, index).split('\n').length;

const shouldScanFile = (relPath: string): boolean =>
	relPath.endsWith('.ts') &&
	!relPath.endsWith('.spec.ts') &&
	!relPath.includes('/__tests__/');

const uniqueViolations = (
	violations: readonly IEphemeralPathViolation[],
): IEphemeralPathViolation[] => {
	const seen = new Set<string>();
	const out: IEphemeralPathViolation[] = [];
	for (const violation of violations) {
		const key = `${violation.file}:${violation.line}:${violation.kind}:${violation.token}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(violation);
	}
	return out;
};

const collectMatches = (
	source: string,
	relPath: string,
	regex: RegExp,
	kind: IEphemeralPathViolation['kind'],
	filter?: (lineText: string, token: string) => boolean,
): IEphemeralPathViolation[] => {
	const violations: IEphemeralPathViolation[] = [];
	for (const match of source.matchAll(regex)) {
		const token = match[0];
		const index = match.index ?? 0;
		const line = lineNumberAt(source, index);
		const lineText = source.split('\n')[line - 1] ?? '';
		if (filter && !filter(lineText, token)) continue;
		violations.push({ file: relPath, line, token, kind });
	}
	return violations;
};

export const scanSourceForEphemeralPathViolations = (
	relPath: string,
	source: string,
): IEphemeralPathViolation[] => {
	if (!shouldScanFile(relPath)) return [];
	const sanitized = stripComments(source);
	const violations: IEphemeralPathViolation[] = [];
	const importsNodeOs = /from\s+['"]node:os['"]/.test(sanitized);

	violations.push(
		...collectMatches(
			sanitized,
			relPath,
			/\bmkdtemp(?:Sync)?\s*\(\s*(?:await\s+)?(?:join\s*\(\s*)?(?:os\.)?tmpdir\s*\(/g,
			'mkdtemp-tmpdir',
		),
	);

	if (importsNodeOs) {
		violations.push(
			...collectMatches(
				sanitized,
				relPath,
				/\b(?:os\.)?tmpdir\s*\(/g,
				'tmpdir-ref',
				(lineText) => !lineText.includes('mkdtemp'),
			),
		);
	}

	violations.push(
		...collectMatches(
			sanitized,
			relPath,
			/\bwriteFile(?:Sync)?\s*\(\s*(['"`])(?:\/tmp\/|\/var\/tmp\/)[^'"`]*\1/g,
			'tmp-write',
		),
	);

	violations.push(
		...collectMatches(
			sanitized,
			relPath,
			/\bwriteFile(?:Sync)?\s*\(\s*(?:join\s*\(\s*)?os\.homedir\s*\(/g,
			'homedir-write',
		),
	);

	return uniqueViolations(violations).sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
};

const walkRuntimeFiles = async (
	root: string,
	dir: string,
): Promise<string[]> => {
	const entries = await readdir(dir).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry)) continue;
		const abs = join(dir, entry);
		const st = await stat(abs).catch(() => undefined);
		if (st?.isDirectory() === true) {
			files.push(...(await walkRuntimeFiles(root, abs)));
			continue;
		}
		if (st?.isFile() !== true) continue;
		const rel = toRelPosix(root, abs);
		if (!shouldScanFile(rel)) continue;
		files.push(rel);
	}
	return files;
};

const listScanRoots = async (root: string): Promise<string[]> => {
	const roots = [join(root, 'packages', 'core', 'src')];
	const pluginEntries = await readdir(join(root, 'plugins')).catch(() => []);
	for (const pluginName of pluginEntries.sort((a, b) => a.localeCompare(b))) {
		roots.push(join(root, 'plugins', pluginName, 'src'));
	}
	return roots;
};

export const findEphemeralPathViolations = async (
	root: string,
): Promise<IEphemeralPathViolation[]> => {
	const files = (
		await Promise.all(
			(
				await listScanRoots(root)
			).map(async (scanRoot) => {
				const st = await stat(scanRoot).catch(() => undefined);
				if (st?.isDirectory() !== true) return [];
				return walkRuntimeFiles(root, scanRoot);
			}),
		)
	).flat();

	const violations: IEphemeralPathViolation[] = [];
	for (const rel of files.sort((a, b) => a.localeCompare(b))) {
		const source = await readFile(join(root, rel), 'utf8');
		violations.push(...scanSourceForEphemeralPathViolations(rel, source));
	}
	return violations;
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const root = repoRoot();
		const violations = await findEphemeralPathViolations(root);
		if (violations.length > 0) {
			console.error(
				`✖ check-ephemeral-paths: ${violations.length} runtime path violation${
					violations.length === 1 ? '' : 's'
				}:`,
			);
			for (const violation of violations) {
				console.error(
					`  ${violation.file}:${violation.line}  ${violation.token}`,
				);
			}
			console.error(
				'  Runtime scratch must resolve through resolveExecPath(ctx, name) or withEphemeralExec(ctx, name, content, fn).',
			);
			process.exit(1);
			return;
		}
		console.log(
			'✓ check-ephemeral-paths: runtime code does not use non-canonical ephemeral paths.',
		);
	})();
}
