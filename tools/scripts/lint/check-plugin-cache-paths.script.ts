#!/usr/bin/env bun
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.cache']);

export interface IPluginCachePathViolation {
	readonly file: string;
	readonly line: number;
	readonly token: 'process.cwd()' | 'literal-cache-join';
}

const stripComments = (source: string): string =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
		.replace(
			/(^|[^:])\/\/.*$/gm,
			(match, prefix: string) =>
				prefix + match.slice(prefix.length).replace(/[^\n]/g, ' '),
		);

const WRITE_CALL_RE =
	/(?:writeFile|writeFileAtomic|mkdir|rename|rm|unlink|mkdtemp|createWriteStream)\s*\(/;

const scanSource = (
	relPath: string,
	source: string,
): IPluginCachePathViolation[] => {
	if (
		!relPath.endsWith('.ts') ||
		relPath.endsWith('.spec.ts') ||
		relPath.includes('/tests/') ||
		relPath.includes('/__tests__/')
	)
		return [];
	const sanitized = stripComments(source);
	const codeLines = sanitized
		.split('\n')
		.map((line) =>
			line.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, (match) =>
				match.replace(/[^\n]/g, ' '),
			),
		);
	const violations: IPluginCachePathViolation[] = [];
	for (const [lineIndex, line] of sanitized.split('\n').entries()) {
		const hasWriter = WRITE_CALL_RE.test(line);
		const hasLegacyLiteral = line.includes('.cache/mcp-vertex');
		const hasCwd = codeLines[lineIndex]?.includes('process.cwd()') === true;
		if ((!hasWriter || !hasLegacyLiteral) && !hasCwd) continue;
		const token: IPluginCachePathViolation['token'] = hasCwd
			? 'process.cwd()'
			: 'literal-cache-join';
		violations.push({
			file: relPath,
			line: lineIndex + 1,
			token,
		});
	}
	return violations;
};

const walk = async (root: string, dir: string): Promise<string[]> => {
	const entries = await readdir(dir).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry)) continue;
		const abs = join(dir, entry);
		const info = await stat(abs).catch(() => undefined);
		if (info?.isDirectory() === true)
			files.push(...(await walk(root, abs)));
		else if (info?.isFile() === true) files.push(relative(root, abs));
	}
	return files;
};

export const findPluginCachePathViolations = async (
	root: string,
): Promise<IPluginCachePathViolation[]> => {
	const roots = [join(root, 'plugins')];
	const files = (
		await Promise.all(
			roots.map(async (scanRoot) =>
				(await stat(scanRoot).catch(() => undefined))?.isDirectory() ===
				true
					? walk(root, scanRoot)
					: [],
			),
		)
	).flat();
	const violations: IPluginCachePathViolation[] = [];
	for (const file of files) {
		violations.push(
			...scanSource(file, await readFile(join(root, file), 'utf8')),
		);
	}
	return violations.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
};

if (
	process.argv[1] !== undefined &&
	import.meta.url === `file://${process.argv[1]}`
) {
	const violations = await findPluginCachePathViolations(repoRoot());
	if (violations.length > 0) {
		console.error(
			'check-plugin-cache-paths: non-canonical runtime paths found:',
		);
		for (const violation of violations) {
			console.error(
				`  ${violation.file}:${violation.line} ${violation.token}`,
			);
		}
		console.error(
			'Use ctx.pluginCacheDir, ctx.cacheDir, or a path capability from the core.',
		);
		process.exit(1);
	}
	console.log(
		'check-plugin-cache-paths: no non-canonical runtime paths found.',
	);
}
