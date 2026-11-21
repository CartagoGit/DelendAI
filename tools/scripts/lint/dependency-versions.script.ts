#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const POLICY_RELATIVE_PATH = 'docs/delendai/DEPENDENCY-VERSIONS.md';
const ROOT_MANIFEST = 'package.json';
const DEPENDENCY_SECTIONS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

interface IWorkspaceManifestPolicy {
	readonly defaults: ReadonlyMap<string, string>;
	readonly exceptions: ReadonlyMap<string, string>;
}

interface IDriftFinding {
	readonly dependency: string;
	readonly manifest: string;
	readonly actualVersion: string;
	readonly defaultVersion: string;
	readonly allowedVersion: string | null;
}

const normalizeCell = (value: string): string => value.trim();

const splitMarkdownRow = (line: string): readonly string[] =>
	line.trim().split('|').slice(1, -1).map(normalizeCell);

const parseMarkdownTable = (
	markdown: string,
	heading: string,
): readonly Record<string, string>[] => {
	const lines = markdown.split(/\r?\n/u);
	const headingLine = `## ${heading}`;
	const headingIndex = lines.findIndex((line) => line.trim() === headingLine);
	if (headingIndex === -1) {
		throw new Error(
			`dependency-versions: missing heading ${JSON.stringify(headingLine)} in ${POLICY_RELATIVE_PATH}`,
		);
	}

	let tableStart = -1;
	for (let index = headingIndex + 1; index < lines.length; index += 1) {
		if (lines[index]?.trim().startsWith('|')) {
			tableStart = index;
			break;
		}
		if (lines[index]?.trim().startsWith('## ')) break;
	}
	if (tableStart === -1 || tableStart + 1 >= lines.length) {
		throw new Error(
			`dependency-versions: heading ${JSON.stringify(headingLine)} does not contain a markdown table`,
		);
	}

	const tableLines: string[] = [];
	for (let index = tableStart; index < lines.length; index += 1) {
		const line = lines[index]?.trim() ?? '';
		if (!line.startsWith('|')) break;
		tableLines.push(line);
	}
	if (tableLines.length < 2) {
		throw new Error(
			`dependency-versions: table under ${JSON.stringify(headingLine)} is incomplete`,
		);
	}

	const headers = splitMarkdownRow(tableLines[0] ?? '').map((header) =>
		header.toLowerCase(),
	);
	const rows: Record<string, string>[] = [];
	for (const line of tableLines.slice(2)) {
		if (!line.includes('|')) continue;
		const cells = splitMarkdownRow(line);
		if (cells.every((cell) => cell.length === 0)) continue;
		if (cells.length !== headers.length) {
			throw new Error(
				`dependency-versions: malformed row in ${JSON.stringify(headingLine)} table: ${line}`,
			);
		}
		const row: Record<string, string> = {};
		for (let index = 0; index < headers.length; index += 1) {
			const header = headers[index];
			if (header !== undefined) {
				row[header] = cells[index] ?? '';
			}
		}
		rows.push(row);
	}
	return rows;
};

const parsePolicy = (markdown: string): IWorkspaceManifestPolicy => {
	const defaultsRows = parseMarkdownTable(markdown, 'Defaults');
	const exceptionRows = parseMarkdownTable(markdown, 'Exceptions');
	const defaults = new Map<string, string>();
	for (const row of defaultsRows) {
		const dependency = row.dependency ?? '';
		const defaultVersion = row['default version'] ?? '';
		if (dependency.length === 0 || defaultVersion.length === 0) {
			throw new Error(
				'dependency-versions: defaults table requires Dependency and Default version columns',
			);
		}
		if (defaults.has(dependency)) {
			throw new Error(
				`dependency-versions: duplicate default policy for ${dependency}`,
			);
		}
		defaults.set(dependency, defaultVersion);
	}
	if (defaults.size === 0) {
		throw new Error('dependency-versions: policy defaults table is empty');
	}

	const exceptions = new Map<string, string>();
	for (const row of exceptionRows) {
		const dependency = row.dependency ?? '';
		const manifest = row.manifest ?? '';
		const allowedVersion = row['allowed version'] ?? '';
		if (
			dependency.length === 0 ||
			manifest.length === 0 ||
			allowedVersion.length === 0
		) {
			throw new Error(
				'dependency-versions: exceptions table requires Dependency, Manifest and Allowed version columns',
			);
		}
		if (!defaults.has(dependency)) {
			throw new Error(
				`dependency-versions: exception declared for unknown dependency ${dependency}`,
			);
		}
		const key = `${dependency}::${manifest}`;
		if (exceptions.has(key)) {
			throw new Error(
				`dependency-versions: duplicate exception for ${dependency} in ${manifest}`,
			);
		}
		exceptions.set(key, allowedVersion);
	}

	return { defaults, exceptions };
};

const readManifestVersion = (
	manifest: Record<string, unknown>,
	dependency: string,
): string | null => {
	if (dependency === 'bun') {
		const packageManager = manifest.packageManager;
		if (
			typeof packageManager === 'string' &&
			packageManager.startsWith('bun@')
		) {
			return packageManager.slice('bun@'.length);
		}
		return null;
	}
	for (const section of DEPENDENCY_SECTIONS) {
		const entries = manifest[section];
		if (entries === null || typeof entries !== 'object') continue;
		const version = (entries as Record<string, unknown>)[dependency];
		if (typeof version === 'string') return version;
	}
	return null;
};

const manifestExists = async (
	rootDir: string,
	relativeManifest: string,
): Promise<boolean> => {
	try {
		await readFile(join(rootDir, relativeManifest), 'utf8');
		return true;
	} catch {
		return false;
	}
};

const expandWorkspacePattern = async (
	rootDir: string,
	pattern: string,
): Promise<readonly string[]> => {
	if (!pattern.endsWith('/*')) {
		const manifest = `${pattern}/package.json`;
		return (await manifestExists(rootDir, manifest)) ? [manifest] : [];
	}
	const prefix = pattern.slice(0, -2);
	const directoryEntries = await readdir(join(rootDir, prefix), {
		withFileTypes: true,
	}).catch(() => []);
	const manifests: string[] = [];
	for (const entry of directoryEntries.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (!entry.isDirectory()) continue;
		const manifest = `${prefix}/${entry.name}/package.json`;
		if (await manifestExists(rootDir, manifest)) {
			manifests.push(manifest);
		}
	}
	return manifests;
};

const discoverWorkspaceManifests = async (
	rootDir: string,
): Promise<readonly string[]> => {
	const rootManifest = JSON.parse(
		await readFile(join(rootDir, ROOT_MANIFEST), 'utf8'),
	) as { workspaces?: unknown };
	const workspacePatterns = Array.isArray(rootManifest.workspaces)
		? rootManifest.workspaces.filter(
				(pattern): pattern is string => typeof pattern === 'string',
			)
		: [];
	const manifests = new Set<string>([ROOT_MANIFEST]);
	for (const pattern of workspacePatterns) {
		for (const manifest of await expandWorkspacePattern(rootDir, pattern)) {
			manifests.add(manifest);
		}
	}
	return [...manifests].sort((left, right) => left.localeCompare(right));
};

const findDrifts = async (
	rootDir: string,
	policy: IWorkspaceManifestPolicy,
): Promise<readonly IDriftFinding[]> => {
	const manifests = await discoverWorkspaceManifests(rootDir);
	const findings: IDriftFinding[] = [];
	for (const manifestPath of manifests) {
		const manifest = JSON.parse(
			await readFile(join(rootDir, manifestPath), 'utf8'),
		) as Record<string, unknown>;
		for (const [dependency, defaultVersion] of policy.defaults) {
			const actualVersion = readManifestVersion(manifest, dependency);
			if (actualVersion === null || actualVersion === defaultVersion) {
				continue;
			}
			const allowedVersion =
				policy.exceptions.get(`${dependency}::${manifestPath}`) ?? null;
			if (allowedVersion === actualVersion) {
				continue;
			}
			findings.push({
				dependency,
				manifest: manifestPath,
				actualVersion,
				defaultVersion,
				allowedVersion,
			});
		}
	}
	return findings.sort((left, right) => {
		const manifestOrder = left.manifest.localeCompare(right.manifest);
		if (manifestOrder !== 0) return manifestOrder;
		return left.dependency.localeCompare(right.dependency);
	});
};

const formatSuccess = (
	policy: IWorkspaceManifestPolicy,
	manifestCount: number,
): string =>
	`dependency-versions: 0 unjustified drifts across ${manifestCount} manifest(s); governed keys: ${[...policy.defaults.keys()].join(', ')}\n`;

const formatFailure = (findings: readonly IDriftFinding[]): string => {
	const lines = [
		`dependency-versions: ${findings.length} unjustified drift(s)`,
	];
	for (const finding of findings) {
		lines.push(
			`  ${finding.manifest} :: ${finding.dependency} -> found ${finding.actualVersion}, default ${finding.defaultVersion}${finding.allowedVersion === null ? '' : `, allowed ${finding.allowedVersion}`}`,
		);
	}
	return `${lines.join('\n')}\n`;
};

const main = async (): Promise<number> => {
	const rootDir = repoRoot();
	const policyMarkdown = await readFile(
		join(rootDir, POLICY_RELATIVE_PATH),
		'utf8',
	);
	const policy = parsePolicy(policyMarkdown);
	const manifests = await discoverWorkspaceManifests(rootDir);
	const findings = await findDrifts(rootDir, policy);
	if (findings.length === 0) {
		process.stdout.write(formatSuccess(policy, manifests.length));
		return 0;
	}
	process.stderr.write(formatFailure(findings));
	return 1;
};

const exitCode = await main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n`);
	return 1;
});

process.exit(exitCode);
