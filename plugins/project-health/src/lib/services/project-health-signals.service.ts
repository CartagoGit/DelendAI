/**
 * project-health-signals.service.ts — f00166: cheap summary signal
 * probes. Every probe here is bounded and deterministic (no heavy
 * scanners, no subprocess). The orchestrator
 * (`project-health.service.ts`) turns these signals into the compact
 * summary + lazy domain hints; the real domain tools stay on-demand.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { FindingSeverity, IFileReader } from '@mcp-vertex/core/public';
import { resolveScopes } from '@mcp-vertex/quality/public';
import { scanMarkers } from '@mcp-vertex/tech-debt/public';

import {
	PROJECT_HEALTH_DEBT_WEIGHTS,
	PROJECT_HEALTH_DEFAULT_SECURITY_SCORE,
	PROJECT_HEALTH_IGNORE_DIRS,
	PROJECT_HEALTH_MAX_MARKER_FILES,
	PROJECT_HEALTH_MARKER_CONTENT_LIMIT,
	PROJECT_HEALTH_MAX_SECURITY_PATHS,
	PROJECT_HEALTH_QUALITY_CONFIG_SCORE,
	PROJECT_HEALTH_QUALITY_SCOPE_SCORE,
	PROJECT_HEALTH_SAMPLE_FILE_EXTENSIONS,
	PROJECT_HEALTH_SAMPLE_ROOTS,
	PROJECT_HEALTH_SECURITY_PATH_PENALTY,
	PROJECT_HEALTH_WITH_LOCKFILE_SCORE,
	PROJECT_HEALTH_WITHOUT_LOCKFILE_SCORE,
} from '../contracts/constants/project-health.constant';
import type {
	IProjectHealthScore,
	IProjectHealthSignals,
	IProjectHealthToolOptions,
} from '../contracts/interfaces/project-health.interface';

const LOCKFILES = [
	'bun.lock',
	'bun.lockb',
	'package-lock.json',
	'pnpm-lock.yaml',
	'yarn.lock',
] as const;
const LINT_CONFIGS = [
	'biome.json',
	'eslint.config.js',
	'eslint.config.mjs',
	'eslint.config.cjs',
	'.eslintrc',
	'.eslintrc.json',
	'.eslintrc.js',
	'.eslintrc.cjs',
	'stylelint.config.mjs',
] as const;
const TEST_CONFIGS = [
	'vitest.config.ts',
	'vitest.config.mts',
	'vitest.config.js',
	'vitest.shared.ts',
] as const;

const SUSPICIOUS_FILE_RE =
	/^(?:\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?|id_rsa|id_dsa|.*\.(?:pem|key|p12|pfx))$/iu;

const clampScore = (value: number): number =>
	Math.max(0, Math.min(100, Math.round(value)));

const createReader = (workspaceRootAbs: string): IFileReader => ({
	readFile: async (filePath: string) => {
		try {
			return await readFile(join(workspaceRootAbs, filePath), 'utf8');
		} catch {
			return undefined;
		}
	},
	exists: async (filePath: string) => {
		try {
			await readFile(join(workspaceRootAbs, filePath), 'utf8');
			return true;
		} catch {
			return false;
		}
	},
	listDir: async (relativePath: string) => {
		try {
			return await readdir(join(workspaceRootAbs, relativePath), 'utf8');
		} catch {
			return [];
		}
	},
});

const hasConfig = async (
	workspaceRootAbs: string,
	paths: readonly string[],
): Promise<boolean> => {
	for (const path of paths) {
		try {
			await readFile(join(workspaceRootAbs, path), 'utf8');
			return true;
		} catch {
			// Continue.
		}
	}
	return false;
};

const collectSampleFiles = async (
	workspaceRootAbs: string,
	limit: number,
	includeAllExtensions: boolean,
): Promise<string[]> => {
	const queue: Array<{ abs: string; rel: string }> =
		PROJECT_HEALTH_SAMPLE_ROOTS.map((root) => ({
			abs: join(workspaceRootAbs, root),
			rel: root,
		}));
	const collected: string[] = [];
	while (queue.length > 0 && collected.length < limit) {
		const next = queue.shift();
		if (next === undefined) break;
		let entries: readonly string[] = [];
		try {
			entries = await readdir(next.abs, 'utf8');
		} catch {
			continue;
		}
		for (const entryName of entries) {
			if (PROJECT_HEALTH_IGNORE_DIRS.has(entryName)) continue;
			const relPath = `${next.rel}/${entryName}`;
			const absPath = join(next.abs, entryName);
			let isDirectory = false;
			try {
				isDirectory = (await stat(absPath)).isDirectory();
			} catch {
				continue;
			}
			if (isDirectory) {
				queue.push({ abs: absPath, rel: relPath });
				continue;
			}
			if (
				!includeAllExtensions &&
				!PROJECT_HEALTH_SAMPLE_FILE_EXTENSIONS.has(
					extname(entryName).toLowerCase(),
				)
			) {
				continue;
			}
			collected.push(relPath);
			if (collected.length >= limit) break;
		}
	}
	return collected;
};

const scoreDebt = (severityCounts: readonly FindingSeverity[]): number => {
	let penalty = 0;
	for (const severity of severityCounts) {
		penalty +=
			severity === 'critical'
				? PROJECT_HEALTH_DEBT_WEIGHTS.high
				: PROJECT_HEALTH_DEBT_WEIGHTS[severity];
	}
	return clampScore(100 - penalty);
};

const detectLockfile = async (
	workspaceRootAbs: string,
): Promise<string | undefined> => {
	for (const candidate of LOCKFILES) {
		try {
			await readFile(join(workspaceRootAbs, candidate), 'utf8');
			return candidate;
		} catch {
			// Continue.
		}
	}
	return undefined;
};

const buildScore = (
	security: number,
	deps: number,
	quality: number,
	debt: number,
): IProjectHealthScore => ({
	score: clampScore((security + deps + quality + debt) / 4),
	security,
	deps,
	quality,
	debt,
});

export const summarizeSignals = async (
	options: IProjectHealthToolOptions,
): Promise<IProjectHealthSignals> => {
	const lockfile = await detectLockfile(options.workspaceRootAbs);
	const reader = createReader(options.workspaceRootAbs);
	const resolvedScopes = Object.keys(await resolveScopes(reader, {})).sort(
		(left, right) => left.localeCompare(right),
	);
	const lintConfig = await hasConfig(options.workspaceRootAbs, LINT_CONFIGS);
	const testConfig = await hasConfig(options.workspaceRootAbs, TEST_CONFIGS);
	const securityPaths = await collectSampleFiles(
		options.workspaceRootAbs,
		PROJECT_HEALTH_MAX_SECURITY_PATHS,
		true,
	);
	const suspiciousPaths = securityPaths.filter((path) =>
		SUSPICIOUS_FILE_RE.test(basename(path)),
	);
	const markerPaths = await collectSampleFiles(
		options.workspaceRootAbs,
		PROJECT_HEALTH_MAX_MARKER_FILES,
		false,
	);
	const markerFiles = await Promise.all(
		markerPaths.map(async (path) => ({
			path,
			content: (
				await readFile(join(options.workspaceRootAbs, path), 'utf8')
			).slice(0, PROJECT_HEALTH_MARKER_CONTENT_LIMIT),
		})),
	);
	const findings = scanMarkers(markerFiles);
	const security = clampScore(
		PROJECT_HEALTH_DEFAULT_SECURITY_SCORE -
			suspiciousPaths.length * PROJECT_HEALTH_SECURITY_PATH_PENALTY,
	);
	const deps =
		lockfile === undefined
			? PROJECT_HEALTH_WITHOUT_LOCKFILE_SCORE
			: PROJECT_HEALTH_WITH_LOCKFILE_SCORE;
	const quality =
		(resolvedScopes.length > 0 ? PROJECT_HEALTH_QUALITY_SCOPE_SCORE : 0) +
		(lintConfig ? PROJECT_HEALTH_QUALITY_CONFIG_SCORE : 0) +
		(testConfig ? PROJECT_HEALTH_QUALITY_CONFIG_SCORE : 0);
	const debt =
		findings.length === 0
			? 100
			: scoreDebt(findings.map((finding) => finding.severity));
	return {
		lockfile,
		qualityScopes: resolvedScopes,
		lintConfig,
		testConfig,
		suspiciousPaths,
		markerCount: findings.length,
		sampledFiles: markerFiles.length,
		score: buildScore(security, deps, quality, debt),
	};
};
