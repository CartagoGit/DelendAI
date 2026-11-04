#!/usr/bin/env bun
/**
 * no-legacy-cache-paths.script.ts — `bun run lint:no-legacy-cache-paths`.
 *
 * Runtime and tooling code reaches the cache through the resolved cache
 * directory, never through a hard-coded path of a retired layout. A literal
 * old path in a runtime file recreates, after the lifecycle cleaned it, the
 * very directory it migrated away from.
 *
 * Allowed: the migrators (they must know the old name to detect it), tests
 * and fixtures (they prove compatibility). Historical proposal documents
 * are not source and are not scanned.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
	LEGACY_CACHE_PATH_PATTERN,
	LEGACY_PATH_ALLOWED,
	SCANNED_EXTENSIONS,
	SCANNED_ROOTS,
} from './no-legacy-cache-paths.constant';
import type { ILegacyCachePathFinding } from './no-legacy-cache-paths.interface';

export const isScanned = (path: string): boolean =>
	SCANNED_ROOTS.some((root) => path.startsWith(root)) &&
	SCANNED_EXTENSIONS.test(path) &&
	!LEGACY_PATH_ALLOWED.some((allowed) => allowed.test(path));

export const findLegacyCachePaths = (
	files: readonly { readonly path: string; readonly text: string }[],
): readonly ILegacyCachePathFinding[] =>
	files
		.filter((file) => isScanned(file.path))
		.flatMap((file) =>
			file.text.split('\n').flatMap((text, index) =>
				LEGACY_CACHE_PATH_PATTERN.test(text)
					? [
							{
								path: file.path,
								line: index + 1,
								text: text.trim(),
							},
						]
					: [],
			),
		);

if (import.meta.main) {
	const root = process.cwd();
	const files = execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter(isScanned)
		.flatMap((path) => {
			try {
				return [{ path, text: readFileSync(join(root, path), 'utf8') }];
			} catch {
				return [];
			}
		});
	if (files.length === 0) {
		// A gate that scanned nothing must not read as a pass.
		console.error('✖ no-legacy-cache-paths: no source files were scanned.');
		process.exit(1);
	}
	const findings = findLegacyCachePaths(files);
	if (findings.length === 0) {
		console.log(
			`✓ no-legacy-cache-paths: ${String(files.length)} files, no legacy cache path.`,
		);
		process.exit(0);
	}
	console.error(
		[
			`✖ no-legacy-cache-paths: ${String(findings.length)} legacy cache path(s) in runtime or tooling code.`,
			'',
			...findings.map((f) => `  ${f.path}:${String(f.line)}  ${f.text}`),
			'',
			'  Use the resolved cache directory (ctx.cacheDir, ctx.pluginCacheDir, DEFAULT_CORE_PATHS).',
			'  Only the migrators, tests and fixtures may name a retired layout.',
		].join('\n'),
	);
	process.exit(1);
}
