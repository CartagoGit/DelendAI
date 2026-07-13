#!/usr/bin/env bun
/** High-confidence user-facing copy ratchet (f00108 S3). */
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_WAIVERS = 'tools/scripts/lint/content-integrity.waivers.json';
const ASTRO_ROOT = 'apps/web/src/components';
const TS_ROOTS = [
	'packages/ui-extension/src',
	'extensions/vscode/src/views',
	'extensions/vscode/src/webviews',
] as const;
const MIN_REASON_LENGTH = 16;

export type ContentFindingKind = 'attribute' | 'text';
export interface IContentSourceFile {
	readonly path: string;
	readonly text: string;
}
export interface IContentFinding {
	readonly file: string;
	readonly line: number;
	readonly kind: ContentFindingKind;
	readonly literal: string;
}
export interface IContentWaiver {
	readonly file: string;
	readonly kind: ContentFindingKind;
	readonly literal: string;
	readonly reason: string;
}
export interface IContentIntegrityReport {
	readonly findings: readonly IContentFinding[];
	readonly staleWaivers: readonly IContentWaiver[];
	readonly invalidWaivers: readonly IContentWaiver[];
	readonly scannedFiles: number;
	readonly waived: number;
}

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);
const normalizeLiteral = (value: string): string =>
	value.replace(/\s+/g, ' ').trim();
const lineOf = (text: string, index: number): number =>
	text.slice(0, index).split('\n').length;
const blankPreservingLines = (value: string): string =>
	value.replace(/[^\n]/g, ' ');

export const stripNonMarkup = (source: string, astro: boolean): string => {
	let out = source;
	if (astro) {
		out = out.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---/, blankPreservingLines);
	}
	return out
		.replace(/<!--[\s\S]*?-->/g, blankPreservingLines)
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, blankPreservingLines)
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, blankPreservingLines);
};

const hasVisibleWords = (literal: string): boolean =>
	/\p{L}/u.test(literal) &&
	!literal.includes('${') &&
	!literal.includes('{') &&
	!literal.includes('}') &&
	!['===', '&&', '=>', 'return ', 'const ', ';', '`'].some((token) =>
		literal.includes(token),
	);
const ignoredTextContainer = (prefix: string): boolean => {
	const tag = /<([a-z][\w:-]*)\b[^>]*>\s*$/i.exec(prefix)?.[1]?.toLowerCase();
	return (
		tag !== undefined &&
		['code', 'pre', 'kbd', 'samp', 'svg', 'style', 'script'].includes(tag)
	);
};

export const extractContentFindings = (
	file: IContentSourceFile,
): readonly IContentFinding[] => {
	const astro = file.path.endsWith('.astro');
	const source = stripNonMarkup(file.text, astro);
	const findings: IContentFinding[] = [];
	const seen = new Set<string>();
	const add = (
		kind: ContentFindingKind,
		literalValue: string,
		index: number,
	): void => {
		const literal = normalizeLiteral(literalValue);
		if (!hasVisibleWords(literal)) return;
		const line = lineOf(source, index);
		const key = `${kind}\u0000${literal}\u0000${line}`;
		if (seen.has(key)) return;
		seen.add(key);
		findings.push({ file: file.path, line, kind, literal });
	};
	const fragments: ReadonlyArray<{
		readonly text: string;
		readonly offset: number;
	}> = astro
		? [{ text: source, offset: 0 }]
		: [...source.matchAll(/`([\s\S]*?)`/g)]
				.filter((match) => /<[a-z][^>]*>/i.test(match[1] ?? ''))
				.map((match) => ({
					text: match[1] ?? '',
					offset: (match.index ?? 0) + 1,
				}));
	const attrs =
		/\b(?:aria-label|alt|placeholder|title)\s*=\s*(["'])([^"']+)\1/g;
	for (const fragment of fragments) {
		for (const match of fragment.text.matchAll(attrs)) {
			add(
				'attribute',
				match[2] ?? '',
				fragment.offset + (match.index ?? 0),
			);
		}
		for (const match of fragment.text.matchAll(/>([^<>{}]+)</g)) {
			const localIndex = match.index ?? 0;
			if (
				ignoredTextContainer(
					fragment.text.slice(
						Math.max(0, localIndex - 240),
						localIndex + 1,
					),
				)
			) {
				continue;
			}
			add('text', match[1] ?? '', fragment.offset + localIndex + 1);
		}
	}
	return findings;
};

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const visit = async (dir: string): Promise<void> => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await visit(path);
			else out.push(relative(REPO_ROOT, path).replaceAll('\\', '/'));
		}
	};
	await visit(abs(root));
	return out.sort();
};
const isRenderTs = (path: string): boolean =>
	path.endsWith('.ts') &&
	!path.includes('/test/') &&
	!path.endsWith('.spec.ts') &&
	(/\/render[^/]*\.ts$/.test(path) ||
		path.includes('/views/') ||
		path.includes('/webviews/'));

export const runContentIntegrity = async (
	waiversPath = DEFAULT_WAIVERS,
): Promise<IContentIntegrityReport> => {
	const astroPaths = (await walk(ASTRO_ROOT)).filter((path) =>
		path.endsWith('.astro'),
	);
	const tsPaths = (
		await Promise.all(TS_ROOTS.map(async (root) => await walk(root)))
	)
		.flat()
		.filter(isRenderTs);
	const paths = [...astroPaths, ...tsPaths];
	const files = await Promise.all(
		paths.map(async (path) => ({
			path,
			text: await readFile(abs(path), 'utf8'),
		})),
	);
	const allFindings = files.flatMap((file) => extractContentFindings(file));
	const waivers = JSON.parse(
		await readFile(abs(waiversPath), 'utf8'),
	) as IContentWaiver[];
	const invalidWaivers = waivers.filter(
		(waiver) =>
			waiver.reason.trim().length < MIN_REASON_LENGTH ||
			!waiver.file.includes('/') ||
			!hasVisibleWords(waiver.literal),
	);
	const matchedWaivers = new Set<number>();
	const findings = allFindings.filter((finding) => {
		const index = waivers.findIndex(
			(waiver) =>
				waiver.file === finding.file &&
				waiver.kind === finding.kind &&
				waiver.literal === finding.literal,
		);
		if (index < 0) return true;
		matchedWaivers.add(index);
		return false;
	});
	return {
		findings,
		staleWaivers: waivers.filter((_, index) => !matchedWaivers.has(index)),
		invalidWaivers,
		scannedFiles: files.length,
		waived: allFindings.length - findings.length,
	};
};

const main = async (): Promise<void> => {
	const report = await runContentIntegrity();
	for (const finding of report.findings) {
		console.error(
			`content-integrity: ${finding.file}:${finding.line} [${finding.kind}] ${JSON.stringify(finding.literal)}`,
		);
	}
	for (const waiver of report.invalidWaivers) {
		console.error(
			`content-integrity: invalid waiver ${waiver.file} ${JSON.stringify(waiver.literal)}`,
		);
	}
	for (const waiver of report.staleWaivers) {
		console.error(
			`content-integrity: stale waiver ${waiver.file} ${JSON.stringify(waiver.literal)}`,
		);
	}
	if (
		report.findings.length +
			report.invalidWaivers.length +
			report.staleWaivers.length >
		0
	) {
		process.exitCode = 1;
		return;
	}
	console.log(
		`✓ content-integrity: ${report.scannedFiles} render files, ${report.waived} documented literals, 0 untracked copy regressions.`,
	);
};

if (import.meta.main) await main();
