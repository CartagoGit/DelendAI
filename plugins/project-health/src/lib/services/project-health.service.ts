/** Cheap summary heuristics only; heavy domain scanners stay lazy/on-demand. */
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import type { FindingSeverity, IFileReader } from '@mcp-vertex/core/public';
import { truncateIfTooLarge } from '@mcp-vertex/core/public';
import { resolveScopes } from '@mcp-vertex/quality/public';
import { scanMarkers } from '@mcp-vertex/tech-debt/public';

import {
	DEFAULT_PROJECT_HEALTH_MAX_BYTES,
	PROJECT_HEALTH_DEFAULT_SECURITY_SCORE,
	PROJECT_HEALTH_DEBT_WEIGHTS,
	PROJECT_HEALTH_DEPENDS_ON,
	PROJECT_HEALTH_DOMAIN_TOOLS,
	PROJECT_HEALTH_IGNORE_DIRS,
	PROJECT_HEALTH_MAX_HINT_LENGTH,
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
	IProjectHealthNextAction,
	IProjectHealthOutput,
	IProjectHealthScore,
	IProjectHealthToolArgs,
	IProjectHealthToolOptions,
	TProjectHealthDomain,
} from '../contracts/interfaces/project-health.interface';

interface IProjectHealthSignals {
	readonly lockfile: string | undefined;
	readonly qualityScopes: readonly string[];
	readonly lintConfig: boolean;
	readonly testConfig: boolean;
	readonly suspiciousPaths: readonly string[];
	readonly markerCount: number;
	readonly sampledFiles: number;
	readonly score: IProjectHealthScore;
}

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

const truncateHint = (value: string): string =>
	value.length <= PROJECT_HEALTH_MAX_HINT_LENGTH
		? value
		: `${value.slice(0, PROJECT_HEALTH_MAX_HINT_LENGTH - 1)}…`;

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

const summarizeSignals = async (
	options: IProjectHealthToolOptions,
): Promise<IProjectHealthSignals> => {
	const lockfile = await (async () => {
		for (const candidate of LOCKFILES) {
			try {
				await readFile(
					join(options.workspaceRootAbs, candidate),
					'utf8',
				);
				return candidate;
			} catch {
				// Continue.
			}
		}
		return undefined;
	})();
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
	const score = clampScore((security + deps + quality + debt) / 4);
	return {
		lockfile,
		qualityScopes: resolvedScopes,
		lintConfig,
		testConfig,
		suspiciousPaths,
		markerCount: findings.length,
		sampledFiles: markerFiles.length,
		score: { score, security, deps, quality, debt },
	};
};

const buildNextActions = (
	score: IProjectHealthScore,
	signals: IProjectHealthSignals,
): IProjectHealthNextAction[] => {
	const actions: IProjectHealthNextAction[] = [];
	if (score.security < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.security,
			reason:
				signals.suspiciousPaths.length > 0
					? `Bounded filename scan found ${signals.suspiciousPaths.length} suspicious path(s).`
					: 'Summary security signal is weak by design; run the real secret scanner for findings.',
		});
	}
	if (score.deps < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.deps,
			reason:
				signals.lockfile === undefined
					? 'No lockfile was detected in the workspace root.'
					: `Dependency health still needs the real audit beyond the ${signals.lockfile} lockfile signal.`,
		});
	}
	if (score.quality < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.quality,
			reason:
				signals.qualityScopes.length === 0
					? 'No resolved quality scopes were found from package scripts or validation matrix.'
					: `Resolved scopes (${signals.qualityScopes.join(', ')}) still need real execution results.`,
		});
	}
	if (score.debt < 100) {
		actions.push({
			tool: PROJECT_HEALTH_DOMAIN_TOOLS.debt,
			reason: `Bounded sample found ${signals.markerCount} debt marker(s) across ${signals.sampledFiles} file(s).`,
		});
	}
	return actions.length > 0
		? actions
		: [
				{
					tool: PROJECT_HEALTH_DOMAIN_TOOLS.quality,
					reason: 'All summary heuristics are green; run a real domain tool for ground truth if needed.',
				},
			];
};

const buildDomainHint = (
	domain: Exclude<TProjectHealthDomain, 'summary'>,
	signals: IProjectHealthSignals,
): string => {
	switch (domain) {
		case 'security':
			return truncateHint(
				signals.suspiciousPaths.length > 0
					? `Lazy detail only. Summary saw suspicious filenames: ${signals.suspiciousPaths.join(', ')}. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.security} for actual file-content scanning.`
					: `Lazy detail only. Summary security uses bounded filename signals and found no suspicious names. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.security} for actual scanning.`,
			);
		case 'deps':
			return truncateHint(
				signals.lockfile === undefined
					? `Lazy detail only. No root lockfile was detected. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.deps} for a real dependency audit.`
					: `Lazy detail only. Summary detected ${signals.lockfile}. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.deps} for vulnerability details.`,
			);
		case 'quality':
			return truncateHint(
				`Lazy detail only. Summary resolved ${signals.qualityScopes.length} scope(s)${signals.qualityScopes.length > 0 ? `: ${signals.qualityScopes.join(', ')}` : ''}. Call ${PROJECT_HEALTH_DOMAIN_TOOLS.quality} to execute them.`,
			);
		case 'debt':
			return truncateHint(
				`Lazy detail only. Summary sampled ${signals.sampledFiles} file(s) and found ${signals.markerCount} marker(s). Call ${PROJECT_HEALTH_DOMAIN_TOOLS.debt} for the full debt scan.`,
			);
	}
};

const finalizeOutput = (
	raw: Omit<IProjectHealthOutput, 'bytes' | 'truncated' | 'originalBytes'>,
	maxBytes: number,
): IProjectHealthOutput => {
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return { ...raw, bytes: direct.finalBytes, truncated: false };
	}
	const next = raw.next ?? [];
	const maybeHint =
		raw.hint === undefined ? {} : { hint: truncateHint(raw.hint) };
	const candidates: Omit<
		IProjectHealthOutput,
		'bytes' | 'truncated' | 'originalBytes'
	>[] = [
		{
			...raw,
			next: next.slice(0, 4).map((item) => ({
				tool: item.tool,
				reason: truncateHint(item.reason),
			})),
		},
		{
			...raw,
			next: next.slice(0, 2).map((item) => ({
				tool: item.tool,
				reason: truncateHint(item.reason),
			})),
			...maybeHint,
		},
		{
			...raw,
			next: [],
			...maybeHint,
		},
	];
	for (const candidate of candidates) {
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return {
				...candidate,
				bytes: bounded.finalBytes,
				truncated: true,
				originalBytes: direct.originalBytes,
			};
		}
	}
	const minimal = { ...raw, next: [], ...maybeHint };
	const fallback = truncateIfTooLarge(minimal, maxBytes);
	return {
		...minimal,
		bytes: fallback.finalBytes,
		truncated: true,
		originalBytes: direct.originalBytes,
	};
};

export const buildProjectHealthPayload = async (
	args: IProjectHealthToolArgs,
	options: IProjectHealthToolOptions,
): Promise<IProjectHealthOutput> => {
	const domain = args.domain ?? 'summary';
	const maxBytes = options.maxBytes || DEFAULT_PROJECT_HEALTH_MAX_BYTES;
	const signals = await summarizeSignals(options);
	if (domain !== 'summary') {
		return finalizeOutput(
			{
				domain,
				tool: PROJECT_HEALTH_DOMAIN_TOOLS[domain],
				hint: buildDomainHint(domain, signals),
				dependsOn: [...PROJECT_HEALTH_DEPENDS_ON],
			},
			maxBytes,
		);
	}
	const score = signals.score;
	return finalizeOutput(
		{
			...score,
			next: buildNextActions(score, signals),
			dependsOn: [...PROJECT_HEALTH_DEPENDS_ON],
		},
		maxBytes,
	);
};
