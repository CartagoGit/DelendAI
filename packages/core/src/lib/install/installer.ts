import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

import { writeFileAtomic } from '../shared/atomic-write';
import {
	IDE_TARGETS,
	targetById,
	type IIdeInstallTarget,
	type IInstallEnv,
} from './ide-targets';
import { mergeServerEntry, type IMergeAction } from './merge-config';

export const SERVER_NAME = 'mcp-vertex';
export const PACKAGE = '@mcp-vertex/core';

export type IOsId = 'linux' | 'macos' | 'windows' | 'wsl';

export interface IOsInfo {
	readonly id: IOsId;
	readonly label: string;
	/** WSL = a Linux userland under Windows; some IDEs live on the Windows side. */
	readonly note?: string;
}

/**
 * Identify the OS so the installer reports the right context. WSL reports
 * `platform === 'linux'`; `isWsl` (detected from `/proc/version` or
 * `WSL_DISTRO_NAME` by the caller) distinguishes "Windows + WSL" from native
 * Linux, since Windows-side IDEs keep their config under `/mnt/c/Users/...`.
 */
export const detectOs = (platform: NodeJS.Platform, isWsl = false): IOsInfo => {
	if (platform === 'win32') return { id: 'windows', label: 'Windows' };
	if (platform === 'darwin') return { id: 'macos', label: 'macOS' };
	if (isWsl) {
		return {
			id: 'wsl',
			label: 'Windows (WSL)',
			note: 'Using your Linux home. A Windows-side IDE (e.g. Claude Desktop) keeps its config under /mnt/c/Users/<you>/… — pass --ide there if needed.',
		};
	}
	return { id: 'linux', label: 'Linux' };
};

export type IRunnerVia = 'npx' | 'bunx' | 'pnpm' | 'yarn' | 'deno';

const RUNNERS: Record<
	IRunnerVia,
	{ command: string; pre: readonly string[]; npmPrefix?: boolean }
> = {
	npx: { command: 'npx', pre: ['-y'] },
	bunx: { command: 'bunx', pre: [] },
	pnpm: { command: 'pnpm', pre: ['dlx'] },
	yarn: { command: 'yarn', pre: ['dlx'] },
	deno: { command: 'deno', pre: ['run', '-A'], npmPrefix: true },
};

export interface IInstallOptions {
	readonly via?: IRunnerVia;
	readonly preset?: string;
	readonly pkg?: string;
	/** Explicit target ids; when empty, `init` auto-detects. */
	readonly ide?: readonly string[];
	/** Write to every known target (create files). */
	readonly all?: boolean;
}

/** The `{ command, args, [type] }` server entry for a target + runner choice. */
export const buildServerEntry = (
	target: IIdeInstallTarget,
	options: IInstallOptions,
): Record<string, unknown> => {
	const via = options.via ?? 'npx';
	const pkg = options.pkg ?? PACKAGE;
	const runner = RUNNERS[via];
	const spec = runner.npmPrefix ? `npm:${pkg}` : pkg;
	const args = [
		...runner.pre,
		spec,
		`--preset=${options.preset ?? 'standard'}`,
	];
	const entry: Record<string, unknown> = { command: runner.command, args };
	return target.stdioType ? { type: 'stdio', ...entry } : entry;
};

const exists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

export interface IInstallTargetResult {
	readonly id: string;
	readonly label: string;
	readonly path: string;
	readonly action: IMergeAction | 'skipped';
	readonly reason?: string;
}

/** Merge our server into one target's config file (creating it if needed). */
export const installToTarget = async (
	target: IIdeInstallTarget,
	env: IInstallEnv,
	options: IInstallOptions,
): Promise<IInstallTargetResult> => {
	const path = target.resolve(env);
	if (path === undefined) {
		return {
			id: target.id,
			label: target.label,
			path: '',
			action: 'skipped',
			reason: 'unsupported platform',
		};
	}
	const existing = await readFile(path, 'utf8').catch(() => null);
	const entry = buildServerEntry(target, options);
	const { json, action } = mergeServerEntry(
		existing,
		target.kind,
		SERVER_NAME,
		entry,
	);
	if (action !== 'unchanged') {
		await mkdir(dirname(path), { recursive: true });
		await writeFileAtomic(path, json);
	}
	return { id: target.id, label: target.label, path, action };
};

/** Targets whose config file or an IDE signal path already exists here. */
export const detectTargets = async (
	env: IInstallEnv,
): Promise<IIdeInstallTarget[]> => {
	const found: IIdeInstallTarget[] = [];
	for (const target of IDE_TARGETS) {
		const path = target.resolve(env);
		const candidates = [
			...(path !== undefined ? [path] : []),
			...target.signals(env),
		];
		const hits = await Promise.all(candidates.map(exists));
		if (hits.some(Boolean)) found.push(target);
	}
	return found;
};

export interface IInstallReport {
	readonly ok: boolean;
	readonly detected: boolean;
	readonly os: IOsInfo;
	readonly results: readonly IInstallTargetResult[];
}

/** Resolve the target set (explicit / all / auto-detect) and install to each. */
export const runInstall = async (
	env: IInstallEnv,
	options: IInstallOptions,
): Promise<IInstallReport> => {
	let targets: IIdeInstallTarget[];
	let detected = false;
	if (options.all) {
		targets = [...IDE_TARGETS];
	} else if (options.ide && options.ide.length > 0) {
		targets = options.ide
			.map(targetById)
			.filter((t): t is IIdeInstallTarget => t !== undefined);
	} else {
		targets = await detectTargets(env);
		detected = true;
	}
	const results: IInstallTargetResult[] = [];
	for (const target of targets) {
		results.push(await installToTarget(target, env, options));
	}
	return {
		ok: true,
		detected,
		os: detectOs(env.platform, env.isWsl),
		results,
	};
};
