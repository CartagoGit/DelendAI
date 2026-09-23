/**
 * doctor/runner.ts — f00191 / q00006 Track I.
 *
 * Coordinates the pure doctor checks (manifests, runtime, git-status,
 * stale-docs, permissions) and produces one `IDoctorSection` per check.
 *
 * Server-dependent sections (plugins, tools) live in the command
 * group itself because they call `request('delendai_overview', …)`
 * via the `ICliCommandContext`. The runner is intentionally pure: it
 * reads files, never opens sockets, never throws (a misbehaving check
 * is reported as an `error` section, not propagated up).
 */
import { resolve } from 'node:path';

import { safeListDirNames, safePathExists } from '@delendai/core/public';

import {
	checkGitStatus,
	checkManifests,
	checkPermissions,
	checkRuntime,
	checkStaleDocs,
	checkBranchProtection,
	checkConfig,
	checkDeps,
	checkNetworkDependentSurfaces,
	checkPluginGraph,
	checkPorts,
	checkSchemas,
	checkTokenBudgets,
} from './checks';
import type {
	DoctorCheck,
	IDoctorCheckContext,
	IDoctorFs,
	IDoctorSection,
} from './types';

export interface IDoctorRunnerOptions {
	readonly workspace: string;
	readonly fs?: Partial<IDoctorFs>;
	readonly now?: () => Date;
	/**
	 * Inject additional checks (e.g. third-party hosts can add their
	 * own dimensions). Order matters — checks run in the order
	 * declared.
	 */
	readonly extraChecks?: readonly DoctorCheck[];
}

export const defaultChecks: readonly DoctorCheck[] = [
	checkConfig,
	checkManifests,
	checkPluginGraph,
	checkDeps,
	checkTokenBudgets,
	checkBranchProtection,
	checkRuntime,
	checkStaleDocs(),
	checkGitStatus(),
	checkPermissions,
	checkSchemas,
	checkPorts,
	checkNetworkDependentSurfaces,
];

/**
 * The filesystem, asked directly.
 *
 * `fileExists` spawned `test -e` and `listDirs` spawned `ls -1`, with the
 * child's stderr inherited. Both already treat absence as an ANSWER — a
 * missing directory returns `[]` — but `ls` printed
 * `ls: cannot access 'plugins': No such file or directory` into the
 * caller's terminal on its way to being handled. Run in a project that is
 * not laid out like this repository, the doctor emitted four such lines
 * before reporting a health score, and none of them was a finding.
 *
 * Two shells per check also made every probe a process, and `test`/`ls`
 * are not a contract any host is obliged to provide.
 *
 * `safeListDirNames` is this repository's one answer to "list a
 * directory, tolerating absence"; using it means the doctor cannot
 * disagree with the rest of the codebase about what a missing directory
 * means.
 */
const realFs: IDoctorFs = {
	// `test -e` answered for a directory as well as a file, and the checks
	// rely on that; `Bun.file(...).exists()` does not, so the helper has to
	// be the one that stats. Paths arrive relative to the process, exactly
	// as the shells resolved them.
	fileExists: async (rel) => (await safePathExists(resolve(rel))).exists,
	readFile: async (rel) => {
		try {
			const file = Bun.file(rel);
			return await file.text();
		} catch {
			return undefined;
		}
	},
	listDirs: async (rel) => (await safeListDirNames(resolve(rel))).names,
};

/**
 * Run every registered pure check sequentially and collect their
 * sections. A check that throws becomes an `error` section — the
 * runner does NOT propagate, so one broken check cannot abort the
 * whole doctor run.
 */
export const runDoctorChecks = async (
	options: IDoctorRunnerOptions,
): Promise<IDoctorSection[]> => {
	const ctx: IDoctorCheckContext = {
		workspace: options.workspace,
		fs: {
			fileExists: options.fs?.fileExists ?? realFs.fileExists,
			readFile: options.fs?.readFile ?? realFs.readFile,
			listDirs: options.fs?.listDirs ?? realFs.listDirs,
		},
		now: options.now ?? (() => new Date()),
	};
	const checks = options.extraChecks ?? defaultChecks;
	const sections: IDoctorSection[] = [];
	for (const check of checks) {
		try {
			sections.push(await check(ctx));
		} catch (error) {
			sections.push({
				name: 'check-failure',
				status: 'error',
				findings: [
					error instanceof Error
						? `${error.message}`
						: 'unknown check failure',
				],
			});
		}
	}
	return sections;
};
