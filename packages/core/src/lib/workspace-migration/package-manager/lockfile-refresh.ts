import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runCommand, type IRunCommandOutcome } from '../../shared/run-command';

import {
	detectPackageManager,
	lockfilesForPackageManager,
	primaryLockfileForPackageManager,
	type PackageManagerId,
} from './detect-package-manager';

export interface ILockfileRefreshSnapshot {
	readonly path: string;
	readonly content: string | null;
}

export interface ILockfileRefreshIO {
	readonly exists: (absolutePath: string) => Promise<boolean>;
	readonly read: (absolutePath: string) => Promise<string | null>;
	readonly write: (absolutePath: string, content: string) => Promise<void>;
	readonly remove: (absolutePath: string) => Promise<void>;
}

export type ILockfileRefreshRunner = (
	command: string,
	options: Readonly<{
		cwd: string;
		lockPath: string;
	}>,
) => Promise<IRunCommandOutcome>;

export interface ILockfileRefreshOutcome {
	readonly status: 'refreshed' | 'rolled-back' | 'failed';
	readonly packageManager: PackageManagerId;
	readonly command: string;
	readonly lockfilePaths: readonly string[];
	readonly output: string;
	readonly restoredFiles: readonly string[];
	readonly reason?: string | undefined;
}

const PACKAGE_MANIFEST = 'package.json';

const createFileSystemIo = (): ILockfileRefreshIO => ({
	exists: async (absolutePath) =>
		readFile(absolutePath, 'utf8').then(
			() => true,
			() => false,
		),
	read: async (absolutePath) =>
		readFile(absolutePath, 'utf8').then(
			(text) => text,
			() => null,
		),
	write: async (absolutePath, content) =>
		writeFile(absolutePath, content, 'utf8'),
	remove: async (absolutePath) => {
		await rm(absolutePath, { force: true });
	},
});

const defaultRunner: ILockfileRefreshRunner = async (command, options) =>
	runCommand(command, {
		cwd: options.cwd,
		lockPath: options.lockPath,
		timeoutMs: 120000,
		maxOutputBytes: 64 * 1024,
	});

const commandForPackageManager = (packageManager: PackageManagerId): string => {
	switch (packageManager) {
		case 'bun':
			return 'bun install';
		case 'pnpm':
			return 'pnpm install --lockfile-only';
		case 'yarn':
			return 'yarn install --mode=skip-build';
		case 'npm':
			return 'npm install --package-lock-only';
		case 'unknown':
			return '';
	}
};

const snapshotPaths = async (
	io: ILockfileRefreshIO,
	absolutePaths: readonly string[],
): Promise<readonly ILockfileRefreshSnapshot[]> => {
	const snapshots: ILockfileRefreshSnapshot[] = [];
	for (const absolutePath of absolutePaths) {
		snapshots.push({
			path: absolutePath,
			content: await io.read(absolutePath),
		});
	}
	return snapshots;
};

const restoreSnapshots = async (
	io: ILockfileRefreshIO,
	snapshots: readonly ILockfileRefreshSnapshot[],
): Promise<readonly string[]> => {
	const restored: string[] = [];
	for (const snapshot of snapshots) {
		if (snapshot.content === null) {
			await io.remove(snapshot.path);
			restored.push(snapshot.path);
			continue;
		}
		await io.write(snapshot.path, snapshot.content);
		restored.push(snapshot.path);
	}
	return restored;
};

export const refreshLockfile = async (input: {
	readonly workspaceRoot: string;
	readonly packageManager?: PackageManagerId | undefined;
	readonly io?: ILockfileRefreshIO | undefined;
	readonly runner?: ILockfileRefreshRunner | undefined;
}): Promise<ILockfileRefreshOutcome> => {
	const io = input.io ?? createFileSystemIo();
	const packageManager =
		input.packageManager ??
		(await detectPackageManager(input.workspaceRoot));
	const command = commandForPackageManager(packageManager);
	if (packageManager === 'unknown' || command === '') {
		return {
			status: 'failed',
			packageManager,
			command,
			lockfilePaths: [],
			output: '',
			restoredFiles: [],
			reason: 'unable to detect package manager from lockfile',
		};
	}

	const lockfiles = lockfilesForPackageManager(packageManager).map((path) =>
		join(input.workspaceRoot, path),
	);
	const manifestPath = join(input.workspaceRoot, PACKAGE_MANIFEST);
	const snapshots = await snapshotPaths(io, [manifestPath, ...lockfiles]);
	const run = input.runner ?? defaultRunner;
	const lockPath = join(
		input.workspaceRoot,
		primaryLockfileForPackageManager(packageManager) ?? PACKAGE_MANIFEST,
	);
	const outcome = await run(command, {
		cwd: input.workspaceRoot,
		lockPath,
	});

	if (outcome.code !== 0 || outcome.timedOut) {
		const restoredFiles = await restoreSnapshots(io, snapshots);
		return {
			status: 'rolled-back',
			packageManager,
			command,
			lockfilePaths: lockfiles,
			output: outcome.output,
			restoredFiles,
			reason: outcome.timedOut
				? 'lockfile refresh timed out'
				: `package manager exited with ${outcome.code}`,
		};
	}

	const lockfilePresent = await Promise.all(
		lockfiles.map((path) => io.exists(path)),
	);
	if (!lockfilePresent.some(Boolean)) {
		const restoredFiles = await restoreSnapshots(io, snapshots);
		return {
			status: 'rolled-back',
			packageManager,
			command,
			lockfilePaths: lockfiles,
			output: outcome.output,
			restoredFiles,
			reason: 'package manager succeeded but no lockfile was produced',
		};
	}

	return {
		status: 'refreshed',
		packageManager,
		command,
		lockfilePaths: lockfiles,
		output: outcome.output,
		restoredFiles: [],
	};
};

export {
	commandForPackageManager,
	createFileSystemIo as createLockfileRefreshIo,
};
