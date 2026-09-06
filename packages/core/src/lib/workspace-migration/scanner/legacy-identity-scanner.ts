import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { IResidualHit } from '../../contracts/interfaces/workspace-migration.interface';

import { LEGACY_IDENTITY_SPELLINGS } from '../../contracts/constants/legacy-identity.constant';
import { LEGACY_FLAG_PATTERN, toResidualHit } from './classification';

export interface ILegacyIdentityScannerOptions {
	readonly extraHistoricalSegments?: readonly string[];
	readonly excludePrefixes?: readonly string[];
}

export interface ILegacyIdentityScanResult {
	readonly ok: boolean;
	readonly hits: readonly IResidualHit[];
	readonly liveHits: readonly IResidualHit[];
}

const DEFAULT_EXCLUDES = ['.git'] as const;

export const scanLegacyIdentity = async (
	workspaceRoot: string,
	options: ILegacyIdentityScannerOptions = {},
): Promise<ILegacyIdentityScanResult> => {
	const files = await listFiles(
		workspaceRoot,
		'',
		options.excludePrefixes ?? DEFAULT_EXCLUDES,
	);
	const hits: IResidualHit[] = [];
	for (const file of files) {
		const text = await safeReadText(join(workspaceRoot, file));
		if (text === null) continue;
		const lines = text.split(/\r?\n/u);
		for (let index = 0; index < lines.length; index += 1) {
			const line = lines[index] ?? '';
			for (const spelling of spellingsInLine(line)) {
				hits.push(
					toResidualHit({
						file,
						line: index + 1,
						text: line,
						spelling,
						...(options.extraHistoricalSegments === undefined
							? {}
							: {
									extraHistoricalSegments:
										options.extraHistoricalSegments,
								}),
					}),
				);
			}
		}
	}
	const liveHits = hits.filter((hit) => hit.classification === 'live');
	return {
		ok: liveHits.length === 0,
		hits,
		liveHits,
	};
};

const spellingsInLine = (line: string): readonly string[] => {
	const hits = new Set<string>();
	for (const spelling of LEGACY_IDENTITY_SPELLINGS) {
		if (line.includes(spelling)) hits.add(spelling);
	}
	LEGACY_FLAG_PATTERN.lastIndex = 0;
	if (LEGACY_FLAG_PATTERN.test(line)) hits.add('--mcp-vertex-*');
	return [...hits];
};

const safeReadText = async (absolutePath: string): Promise<string | null> => {
	const bytes = await readFile(absolutePath).catch(() => null);
	if (bytes === null) return null;
	if (bytes.includes(0)) return null;
	return bytes.toString('utf8');
};

const listFiles = async (
	workspaceRoot: string,
	relativeRoot: string,
	excludePrefixes: readonly string[],
): Promise<string[]> => {
	const absoluteRoot =
		relativeRoot === '' ? workspaceRoot : join(workspaceRoot, relativeRoot);
	const entries = await readdir(absoluteRoot, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const next = normalizeRelative(
			relativeRoot === '' ? entry.name : `${relativeRoot}/${entry.name}`,
		);
		if (isExcluded(next, excludePrefixes)) continue;
		if (entry.isDirectory()) {
			files.push(
				...(await listFiles(workspaceRoot, next, excludePrefixes)),
			);
			continue;
		}
		if (entry.isFile()) files.push(next);
	}
	return files;
};

const normalizeRelative = (value: string): string =>
	relative('', value).replaceAll('\\', '/');

const isExcluded = (
	relativePath: string,
	excludePrefixes: readonly string[],
): boolean =>
	excludePrefixes.some(
		(prefix) =>
			relativePath === prefix || relativePath.startsWith(`${prefix}/`),
	);
