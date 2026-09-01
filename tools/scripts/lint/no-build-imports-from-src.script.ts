#!/usr/bin/env bun
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export interface IBuildSourceImportFinding {
	readonly file: string;
	readonly line: number;
	readonly specifier: string;
}

const JAVASCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const RELATIVE_SOURCE_IMPORT =
	/^\s*(?:import\s*["']([^"']*src\/[^"']*)["']|(?:import|export)\b.*?\bfrom\s*["']([^"']*src\/[^"']*)["']|.*?require\(\s*["']([^"']*src\/[^"']*)["']\s*\))/;

const stripTemplateLiteralContent = (
	line: string,
	initiallyInside: boolean,
): { readonly code: string; readonly inside: boolean } => {
	let inside = initiallyInside;
	let escaped = false;
	let code = '';
	for (const character of line) {
		if (escaped) {
			escaped = false;
			if (!inside) code += character;
			continue;
		}
		if (character === '\\') {
			escaped = true;
			if (!inside) code += character;
			continue;
		}
		if (character === '`') {
			inside = !inside;
			code += ' ';
			continue;
		}
		if (!inside) code += character;
	}
	return { code, inside };
};

const collectJavaScriptFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => [],
	);
	const files: string[] = [];
	for (const entry of entries) {
		if (entry.name === 'node_modules') continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectJavaScriptFiles(path)));
			continue;
		}
		const extension = entry.name.slice(entry.name.lastIndexOf('.'));
		if (JAVASCRIPT_EXTENSIONS.has(extension)) files.push(path);
	}
	return files;
};

export const findBuildImportsFromSrc = async (
	buildRoot: string,
): Promise<readonly IBuildSourceImportFinding[]> => {
	const files = await collectJavaScriptFiles(buildRoot);
	const findings: IBuildSourceImportFinding[] = [];
	for (const file of files) {
		const source = await readFile(file, 'utf8');
		let insideTemplateLiteral = false;
		for (const [index, lineText] of source.split('\n').entries()) {
			const stripped = stripTemplateLiteralContent(
				lineText,
				insideTemplateLiteral,
			);
			insideTemplateLiteral = stripped.inside;
			const match = stripped.code.match(RELATIVE_SOURCE_IMPORT);
			const specifier = match?.[1] ?? match?.[2] ?? match?.[3];
			if (specifier === undefined || !specifier.startsWith('.')) continue;
			findings.push({
				file: relative(repoRoot(), file),
				line: index + 1,
				specifier,
			});
		}
	}
	return findings.sort(
		(a, b) => a.file.localeCompare(b.file) || a.line - b.line,
	);
};

export const main = async (): Promise<number> => {
	const root = join(repoRoot(), 'build');
	const findings = await findBuildImportsFromSrc(root);
	if (findings.length === 0) {
		console.log('no-build-imports-from-src: 0 finding(s).');
		return 0;
	}
	console.error(`no-build-imports-from-src: ${findings.length} finding(s):`);
	for (const finding of findings) {
		console.error(
			`  ${finding.file}:${finding.line} imports source: ${finding.specifier}`,
		);
	}
	return 1;
};

if (import.meta.main) process.exit(await main());
