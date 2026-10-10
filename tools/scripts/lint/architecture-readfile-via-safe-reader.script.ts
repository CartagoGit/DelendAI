#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const MANIFEST_FILE = 'plugin.manifest.ts';
const TYPESCRIPT_FILE = /\.ts$/u;
const READFILE_IMPORT_RE =
	/import\s*\{([^}]*)\}\s*from\s*['"]node:fs(?:\/promises)?['"]/gu;
const FS_NAMESPACE_IMPORT_RE =
	/import\s*\*\s*as\s*([A-Za-z_$][\w$]*)\s*from\s*['"]node:fs(?:\/promises)?['"]/gu;
const PERMISSIONS_RE = /permissions\s*:\s*\[([\s\S]*?)\]/u;

export interface IReadFileInvariantFinding {
	readonly pluginId: string;
	readonly relPath: string;
	readonly line: number;
	readonly rule:
		| 'READFILE_IMPORT'
		| 'READFILE_CALL'
		| 'ALLOWLIST_REASON_MISSING';
	readonly detail: string;
}

interface IPluginManifestSummary {
	readonly pluginId: string;
	readonly pluginRootRel: string;
	readonly srcRootAbs: string;
}

interface IAllowRule {
	readonly reason: string;
	readonly files: readonly string[];
}

// Time-boxed allowlist for in-flight proposals still migrating their
// filesystem reads to SafeWorkspaceReader (v00133 squash; owners:
// completion + proposals swarm validation).
const ALLOWLIST: Readonly<Record<string, IAllowRule>> = {
	completion: {
		reason: 'v0133-squash completion-store migration in flight',
		files: ['src/lib/completion-store.service.ts'],
	},
	proposals: {
		reason: 'v0133-squash swarm validation-provider migration in flight',
		files: ['src/lib/swarm/validation-provider.ts'],
	},
};

const normalizeRel = (pathValue: string): string =>
	pathValue.split('\\').join('/');

const lineForOffset = (source: string, offset: number): number => {
	let line = 1;
	for (let index = 0; index < offset; index += 1) {
		if (source.charCodeAt(index) === 10) line += 1;
	}
	return line;
};

const listDirs = async (absDir: string): Promise<readonly string[]> => {
	try {
		const entries = await readdir(absDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(absDir, entry.name));
	} catch {
		return [];
	}
};

const walkTsFiles = async (rootAbs: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [rootAbs];
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
			const abs = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === 'node_modules' || entry.name === 'dist')
					continue;
				stack.push(abs);
				continue;
			}
			if (entry.isFile() && TYPESCRIPT_FILE.test(entry.name)) {
				out.push(abs);
			}
		}
	}
	return out;
};

const isFilesystemReadPlugin = (manifestSource: string): boolean => {
	const match = PERMISSIONS_RE.exec(manifestSource);
	return match?.[1]?.includes('filesystem-read') ?? false;
};

const discoverFilesystemReadPlugins = async (
	root = REPO_ROOT,
): Promise<readonly IPluginManifestSummary[]> => {
	const pluginsRootAbs = join(root, 'plugins');
	const pluginDirs = await listDirs(pluginsRootAbs);
	const summaries: IPluginManifestSummary[] = [];
	for (const pluginDirAbs of pluginDirs) {
		const manifestAbs = join(pluginDirAbs, MANIFEST_FILE);
		const manifest = await readFile(manifestAbs, 'utf8').catch(
			() => undefined,
		);
		if (manifest === undefined || !isFilesystemReadPlugin(manifest))
			continue;
		const pluginId = normalizeRel(relative(pluginsRootAbs, pluginDirAbs));
		summaries.push({
			pluginId,
			pluginRootRel: `plugins/${pluginId}`,
			srcRootAbs: join(pluginDirAbs, 'src'),
		});
	}
	return summaries;
};

const importedReadFileNames = (source: string): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const match of source.matchAll(READFILE_IMPORT_RE)) {
		const imports = match[1] ?? '';
		for (const specifier of imports.split(',')) {
			const trimmed = specifier.trim();
			if (trimmed.length === 0) continue;
			const aliasMatch =
				/^(readFile|readFileSync)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/u.exec(
					trimmed,
				);
			if (aliasMatch === null) continue;
			names.add(aliasMatch[2] ?? aliasMatch[1] ?? '');
		}
	}
	return names;
};

const importedFsNamespaces = (source: string): ReadonlySet<string> => {
	const names = new Set<string>();
	for (const match of source.matchAll(FS_NAMESPACE_IMPORT_RE)) {
		if (match[1] !== undefined) names.add(match[1]);
	}
	return names;
};

const shouldSkipFile = (relPath: string): boolean => {
	const fileName = relPath.split('/').at(-1) ?? relPath;
	return (
		fileName === 'safe-reader.ts' || fileName === 'safe-workspace-reader.ts'
	);
};

const allowReasonFindings = (
	pluginId: string,
	pluginRootRel: string,
): readonly IReadFileInvariantFinding[] => {
	const allow = ALLOWLIST[pluginId];
	if (allow === undefined) return [];
	if (allow.reason.trim().length > 0) return [];
	return [
		{
			pluginId,
			relPath: pluginRootRel,
			line: 1,
			rule: 'ALLOWLIST_REASON_MISSING',
			detail: 'Allowlist entries must include a non-empty reason.',
		},
	];
};

const isAllowlisted = (pluginId: string, relPath: string): boolean =>
	ALLOWLIST[pluginId]?.files.includes(relPath) ?? false;

export const scanReadFileViaSafeReader = async (
	root = REPO_ROOT,
): Promise<readonly IReadFileInvariantFinding[]> => {
	const plugins = await discoverFilesystemReadPlugins(root);
	const findings: IReadFileInvariantFinding[] = [];
	for (const plugin of plugins) {
		findings.push(
			...allowReasonFindings(plugin.pluginId, plugin.pluginRootRel),
		);
		for (const absPath of await walkTsFiles(plugin.srcRootAbs)) {
			const relPath = normalizeRel(
				relative(join(root, plugin.pluginRootRel), absPath),
			);
			if (shouldSkipFile(relPath)) continue;
			const source = await readFile(absPath, 'utf8').catch(() => '');
			if (source.length === 0) continue;
			const importedNames = importedReadFileNames(source);
			const importedNamespaces = importedFsNamespaces(source);
			const allowlisted = isAllowlisted(plugin.pluginId, relPath);
			for (const importedName of importedNames) {
				const importUse = new RegExp(`\\b${importedName}\\b`, 'u');
				const importMatch = source.match(importUse);
				if (importMatch !== null && !allowlisted) {
					findings.push({
						pluginId: plugin.pluginId,
						relPath: `${plugin.pluginRootRel}/${relPath}`,
						line: lineForOffset(
							source,
							source.indexOf(importedName),
						),
						rule: 'READFILE_IMPORT',
						detail: `Direct import of ${importedName} from node:fs is forbidden in filesystem-read plugins. Use SafeWorkspaceReader instead.`,
					});
				}
				const callRe = new RegExp(`\\b${importedName}\\s*\\(`, 'gu');
				for (const callMatch of source.matchAll(callRe)) {
					if (allowlisted) continue;
					findings.push({
						pluginId: plugin.pluginId,
						relPath: `${plugin.pluginRootRel}/${relPath}`,
						line: lineForOffset(source, callMatch.index ?? 0),
						rule: 'READFILE_CALL',
						detail: `Direct ${importedName}(...) call is forbidden in filesystem-read plugins. Route reads through SafeWorkspaceReader.`,
					});
				}
			}
			for (const namespaceName of importedNamespaces) {
				const callRe = new RegExp(
					`\\b${namespaceName}\\.(readFile|readFileSync)\\s*\\(`,
					'gu',
				);
				for (const callMatch of source.matchAll(callRe)) {
					if (allowlisted) continue;
					findings.push({
						pluginId: plugin.pluginId,
						relPath: `${plugin.pluginRootRel}/${relPath}`,
						line: lineForOffset(source, callMatch.index ?? 0),
						rule: 'READFILE_CALL',
						detail: 'Direct fs.readFile(...) call is forbidden in filesystem-read plugins. Route reads through SafeWorkspaceReader.',
					});
				}
			}
		}
	}
	return findings;
};

export const formatReadFileViaSafeReaderReport = (
	findings: readonly IReadFileInvariantFinding[],
): string => {
	if (findings.length === 0) {
		return 'architecture-readfile-via-safe-reader: 0 violations.\n';
	}
	const lines = [
		`architecture-readfile-via-safe-reader: ${findings.length} violation${findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of findings) {
		lines.push(
			`${finding.relPath}:${finding.line} [${finding.rule}] ${finding.detail}`,
		);
	}
	return `${lines.join('\n')}\n`;
};

const BASELINE_REL =
	'tools/scripts/lint/architecture-readfile-via-safe-reader.baseline.json';

/** Stable key for one finding: the rule at a path, ignoring line drift. */
export const findingKey = (finding: IReadFileInvariantFinding): string =>
	`${finding.rule}:${finding.relPath}`;

const readBaseline = (): ReadonlySet<string> => {
	try {
		return new Set(
			JSON.parse(
				readFileSync(join(REPO_ROOT, BASELINE_REL), 'utf8'),
			) as string[],
		);
	} catch {
		return new Set();
	}
};

/**
 * Ratchet, not an absolute rule — and the reason is worth stating,
 * because the alternative is a gate that punishes honesty.
 *
 * This lint picks its scope by reading each manifest's `permissions` for
 * `filesystem-read`. That inference held only while the declaration
 * happened to correlate with "already migrated or migrating". On
 * 2026-09-04 q00017 S6 made every manifest declare the effects its
 * plugin actually uses — `plugins/git` really does read the filesystem —
 * and roughly twenty plugins were silently enrolled in a migration
 * nobody had scoped for them: 50 violations, none of them a new
 * regression, all of them the same day the declarations became true.
 *
 * Declaring a permission is a statement of fact. Enrolling in an
 * architectural migration is a decision. Conflating the two teaches
 * authors to under-declare, which is precisely what
 * `lint:plugin-permissions-declared` exists to prevent.
 *
 * So known violations are recorded and NEW ones still fail. The
 * architectural pressure survives; the perverse incentive does not.
 */
export const main = async (): Promise<number> => {
	const findings = await scanReadFileViaSafeReader();
	if (process.argv.includes('--update')) {
		writeFileSync(
			join(REPO_ROOT, BASELINE_REL),
			`${JSON.stringify([...new Set(findings.map(findingKey))].sort(), null, '\t')}\n`,
			'utf8',
		);
		process.stdout.write(
			`architecture-readfile-via-safe-reader: baseline updated — ${String(findings.length)} finding(s).\n`,
		);
		return 0;
	}
	const baseline = readBaseline();
	const fresh = findings.filter(
		(finding) => !baseline.has(findingKey(finding)),
	);
	if (fresh.length === 0) {
		process.stdout.write(
			`architecture-readfile-via-safe-reader: no new violations (${String(findings.length)} baselined).\n`,
		);
		return 0;
	}
	process.stderr.write(formatReadFileViaSafeReaderReport(fresh));
	process.stderr.write(
		'\nThese are NEW relative to the baseline. Route the read through SafeWorkspaceReader, or\n' +
			'run this script with --update if the growth is deliberate and reviewed.\n',
	);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
