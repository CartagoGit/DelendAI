/**
 * doctor/runner.ts — f00191 / q00006 Track I.
 *
 * Coordinates the pure doctor checks (manifests, runtime, git-status,
 * stale-docs, permissions) and produces one `IDoctorSection` per check.
 *
 * Server-dependent sections (plugins, tools) live in the command
 * group itself because they call `request('mcp-vertex_overview', …)`
 * via the `ICliCommandContext`. The runner is intentionally pure: it
 * reads files, never opens sockets, never throws (a misbehaving check
 * is reported as an `error` section, not propagated up).
 */
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

const realFs: IDoctorFs = {
	fileExists: async (rel) => {
		try {
			const proc = Bun.spawn(['test', '-e', rel], { stdout: 'pipe' });
			const exit = await proc.exited;
			return exit === 0;
		} catch {
			return false;
		}
	},
	readFile: async (rel) => {
		try {
			const file = Bun.file(rel);
			return await file.text();
		} catch {
			return undefined;
		}
	},
	listDirs: async (rel) => {
		try {
			const proc = Bun.spawn(['ls', '-1', rel], { stdout: 'pipe' });
			const exit = await proc.exited;
			if (exit !== 0) return [];
			const stdout = proc.stdout;
			if (stdout === undefined || typeof stdout === 'number') return [];
			const out = await new Response(stdout).text();
			return out
				.split('\n')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0);
		} catch {
			return [];
		}
	},
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
