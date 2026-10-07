#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';

const DEFAULT_THRESHOLD = 5;
const IGNORED_SEGMENTS = new Set([
	'node_modules',
	'dist',
	'.cache',
	'coverage',
]);

export interface IMassContentRemovalFinding {
	readonly branch: string;
	readonly code: 'same-agent-mass-removal';
	readonly count: number;
	readonly deletedFiles: readonly string[];
}

const normalizePath = (path: string): string => path.trim().replace(/\\/g, '/');

export const isMassRemovalTrackedPath = (path: string): boolean => {
	const normalized = normalizePath(path);
	if (normalized === '') return false;
	const segments = normalized.split('/');
	if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return false;
	return (
		normalized.startsWith('plugins/') ||
		normalized.startsWith('packages/core/src/lib/')
	);
};

export const parseDeletedFilesFromDiff = (raw: string): readonly string[] =>
	raw
		.split(/\r?\n/)
		.map((line) => normalizePath(line))
		.filter((line) => line.length > 0)
		.filter(isMassRemovalTrackedPath)
		.sort((a, b) => a.localeCompare(b));

export const summarizeMassContentRemoval = (input: {
	readonly branch: string;
	readonly deletedFiles: readonly string[];
	readonly threshold?: number;
}): IMassContentRemovalFinding | null => {
	const threshold = input.threshold ?? DEFAULT_THRESHOLD;
	if (input.deletedFiles.length < threshold) return null;
	return {
		branch: input.branch,
		code: 'same-agent-mass-removal',
		count: input.deletedFiles.length,
		deletedFiles: [...input.deletedFiles],
	};
};

interface IGitRunner {
	readonly run: (args: readonly string[]) => {
		readonly ok: boolean;
		readonly output: string;
	};
}

const defaultGitRunner: IGitRunner = {
	run: (args) => {
		const result = spawnSync('git', [...args], {
			cwd: process.cwd(),
			encoding: 'utf8',
		});
		return {
			ok: result.status === 0,
			output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
		};
	},
};

const currentBranch = (git: IGitRunner): string | null => {
	const result = git.run(['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!result.ok) return null;
	const branch = result.output.trim();
	return branch === '' || branch === 'HEAD' ? null : branch;
};

const recentBranches = (
	git: IGitRunner,
	sinceIso: string,
): readonly string[] => {
	const result = git.run([
		'for-each-ref',
		'--format=%(refname:short)\t%(committerdate:iso8601)',
		'refs/heads',
	]);
	if (!result.ok) return [];
	const sinceMs = Date.parse(sinceIso);
	return result.output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.flatMap((line) => {
			const [branch, date] = line.split('\t');
			if (!branch || !date) return [];
			const ts = Date.parse(date);
			if (Number.isNaN(ts) || ts < sinceMs) return [];
			return [branch];
		})
		.filter((branch) => branch !== 'develop')
		.sort((a, b) => a.localeCompare(b));
};

export const collectMassContentRemovalFindings = (input: {
	readonly branches: readonly string[];
	readonly threshold?: number;
	readonly git?: IGitRunner;
}): readonly IMassContentRemovalFinding[] => {
	const git = input.git ?? defaultGitRunner;
	const findings: IMassContentRemovalFinding[] = [];
	for (const branch of input.branches) {
		const diff = git.run([
			'diff',
			'--name-only',
			'--diff-filter=D',
			`develop..${branch}`,
			'--',
			'plugins',
			'packages/core/src/lib',
		]);
		if (!diff.ok) continue;
		const finding = summarizeMassContentRemoval({
			branch,
			deletedFiles: parseDeletedFilesFromDiff(diff.output),
			...(input.threshold !== undefined
				? { threshold: input.threshold }
				: {}),
		});
		if (finding !== null) findings.push(finding);
	}
	return findings;
};

const formatFinding = (finding: IMassContentRemovalFinding): string =>
	JSON.stringify(finding);

const main = async (argv: readonly string[]): Promise<number> => {
	const threshold = Number.parseInt(
		process.env.MASS_REMOVAL_THRESHOLD ?? `${DEFAULT_THRESHOLD}`,
		10,
	);
	const auditMode = argv.includes('--audit-removed');
	const git = defaultGitRunner;
	const branches = auditMode
		? recentBranches(
				git,
				new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
			)
		: (() => {
				const branch = currentBranch(git);
				return branch === null ? [] : [branch];
			})();
	const findings = collectMassContentRemovalFindings({
		branches,
		threshold: Number.isNaN(threshold) ? DEFAULT_THRESHOLD : threshold,
		git,
	});
	for (const finding of findings) {
		console.log(formatFinding(finding));
	}
	if (findings.length > 0) return 1;
	console.log(
		'✓ mass-content-removal: no branch crosses the deletion threshold',
	);
	return 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
