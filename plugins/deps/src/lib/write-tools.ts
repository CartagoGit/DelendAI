import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	resolveWorkspaceContained,
	runCommand,
	toolError,
	toolJson,
} from '@mcp-vertex/core/public';

/**
 * Write-side dependency management — `package_install` / `package_run_script`.
 * Unlike `deps_list`/`deps_check` (offline, always-on), these tools spawn a
 * real package-manager process and mutate the workspace, so they are
 * opt-in: a host must set `plugins.deps.options.allowWrite: true` (mirrors
 * the existing `allowNetwork` opt-in for `deps_outdated`) before either is
 * registered. This module only knows package management — it has no
 * opinion on quality gates or anything else a write side-effect might need.
 */

export type IDepSection =
	| 'dependencies'
	| 'devDependencies'
	| 'peerDependencies';

const SECTION_FLAG: Readonly<Record<IDepSection, string | null>> = {
	dependencies: null,
	devDependencies: '--dev',
	peerDependencies: '--peer',
};

export type IPackageEcosystem = 'npm' | 'bun';

const INSTALL_COMMAND: Readonly<Record<IPackageEcosystem, string>> = {
	bun: 'bun add',
	npm: 'npm install',
};

// A package name/range is shell-interpolated into the spawned command, so
// both are validated against a conservative allow-list before any spawn —
// this is the trust boundary for `package_install`.
const SAFE_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const SAFE_RANGE = /^[a-zA-Z0-9.^~<>=|*x \-+]*$/;

export interface IPackageInstallOptions {
	readonly name: string;
	readonly range?: string;
	readonly section?: IDepSection;
	readonly ecosystem?: IPackageEcosystem;
}

export interface IPackageInstallResult {
	readonly ok: boolean;
	readonly command: string;
	readonly code: number;
	readonly timedOut: boolean;
	readonly tail: string;
	readonly error?: string;
}

const tailOf = (text: string, lines = 20): string =>
	text
		.split('\n')
		.filter((l) => l.length > 0)
		.slice(-lines)
		.join('\n');

/** Absolute path to the workspace's `package.json`. */
export const manifestAbsPath = (workspaceRootAbs: string): string =>
	join(workspaceRootAbs, 'package.json');

/**
 * `bun add`/`npm install` a single dependency, guarded by `withFileMutex`
 * (via `runCommand`'s `lockPath`) over the target `package.json` so two
 * concurrent installs in the same workspace can't race each other's writes
 * to the manifest/lockfile. Never throws on a non-zero exit — reported in
 * the result, not thrown.
 */
export const packageInstall = async (
	workspaceRootAbs: string,
	options: IPackageInstallOptions,
): Promise<IPackageInstallResult> => {
	const ecosystem = options.ecosystem ?? 'bun';
	const section = options.section ?? 'dependencies';

	if (!SAFE_NAME.test(options.name)) {
		return {
			ok: false,
			command: '',
			code: -1,
			timedOut: false,
			tail: '',
			error: `rejected: unsafe package name "${options.name}"`,
		};
	}
	if (options.range !== undefined && !SAFE_RANGE.test(options.range)) {
		return {
			ok: false,
			command: '',
			code: -1,
			timedOut: false,
			tail: '',
			error: `rejected: unsafe version range "${options.range}"`,
		};
	}

	const spec =
		options.range !== undefined && options.range.length > 0
			? `${options.name}@${options.range}`
			: options.name;
	const flag = SECTION_FLAG[section];
	const command = [INSTALL_COMMAND[ecosystem], spec, flag]
		.filter((part): part is string => part !== null)
		.join(' ');

	const manifestAbs = manifestAbsPath(workspaceRootAbs);
	const outcome = await runCommand(command, {
		cwd: workspaceRootAbs,
		lockPath: manifestAbs,
	});
	return {
		ok: outcome.code === 0,
		command,
		code: outcome.code,
		timedOut: outcome.timedOut,
		tail: tailOf(outcome.output),
	};
};

export interface IPackageRunScriptOptions {
	readonly script: string;
	readonly args?: readonly string[];
	readonly cwd?: string;
}

export interface IPackageRunScriptResult {
	readonly ok: boolean;
	readonly command: string;
	readonly code: number;
	readonly timedOut: boolean;
	readonly tail: string;
	readonly error?: string;
}

// Scripts are looked up by name only (no shell metacharacters); the actual
// command line still runs through the shell via `bun run`, so the script
// name itself is validated the same way a package name would be.
const SAFE_SCRIPT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/;
const SAFE_ARG = /^[a-zA-Z0-9._\-/=:@]*$/;

const rejected = (error: string): IPackageRunScriptResult => ({
	ok: false,
	command: '',
	code: -1,
	timedOut: false,
	tail: '',
	error,
});

/** `true` when `package.json` at `manifestAbs` declares a script named `script`. */
const scriptExists = async (
	manifestAbs: string,
	script: string,
): Promise<boolean> => {
	try {
		const raw = await readFile(manifestAbs, 'utf8');
		const parsed = JSON.parse(raw) as { scripts?: Record<string, unknown> };
		return typeof parsed.scripts?.[script] === 'string';
	} catch {
		return false;
	}
};

/**
 * `bun run <script> [...args]` in `cwd` (workspace-contained; defaults to
 * the workspace root). Rejects (without spawning) a script that isn't
 * declared in `package.json`. Captures stdout/stderr and the exit code; a
 * non-zero exit is reported in the result, never thrown.
 */
export const packageRunScript = async (
	workspaceRootAbs: string,
	options: IPackageRunScriptOptions,
): Promise<IPackageRunScriptResult> => {
	if (!SAFE_SCRIPT_NAME.test(options.script)) {
		return rejected(`rejected: unsafe script name "${options.script}"`);
	}
	const args = options.args ?? [];
	for (const arg of args) {
		if (!SAFE_ARG.test(arg)) {
			return rejected(`rejected: unsafe script argument "${arg}"`);
		}
	}

	const cwdRel = options.cwd ?? '.';
	const contained = resolveWorkspaceContained(workspaceRootAbs, cwdRel);
	if (!contained.ok) {
		return rejected(
			contained.reason ?? `rejected: cwd "${cwdRel}" escapes workspace`,
		);
	}

	const manifestAbs = manifestAbsPath(workspaceRootAbs);
	if (!(await scriptExists(manifestAbs, options.script))) {
		return rejected(
			`rejected: no script named "${options.script}" in package.json`,
		);
	}

	const command = ['bun run', options.script, ...args].join(' ');
	const outcome = await runCommand(command, { cwd: contained.abs });
	return {
		ok: outcome.code === 0,
		command,
		code: outcome.code,
		timedOut: outcome.timedOut,
		tail: tailOf(outcome.output),
	};
};

export interface IDepsWriteToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
}

/**
 * `package_install` / `package_run_script` — opt-in write-side tools.
 * Callers gate registration behind `plugins.deps.options.allowWrite: true`
 * (see `index.ts`); this builder itself has no opinion on the flag, it
 * just declares the real `effects` so a host that DOES register them can
 * still reason about trust per-tool.
 */
export const buildDepsWriteToolRegistrations = (
	options: IDepsWriteToolOptions,
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'package_install',
			effects: ['write', 'spawn', 'network'],
			summary:
				'Install a dependency via bun/npm into package.json (opt-in, mutates the workspace).',
			tags: ['deps', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_package_install`,
					{
						description:
							'Install a single dependency (`bun add`/`npm install`) into the workspace package.json. `section` picks dependencies/devDependencies/peerDependencies (default dependencies). Opt-in (plugins.deps.options.allowWrite:true). This DOES write package.json/lockfile and may hit the network.',
						inputSchema: z.object({
							name: z.string(),
							range: z.string().optional(),
							section: z
								.enum([
									'dependencies',
									'devDependencies',
									'peerDependencies',
								])
								.optional(),
							ecosystem: z.enum(['npm', 'bun']).optional(),
						}),
						outputSchema: z.object({
							ok: z.boolean(),
							command: z.string(),
							code: z.number(),
							timedOut: z.boolean(),
							tail: z.string(),
							error: z.string().optional(),
						}),
					},
					async (args: {
						name: string;
						range?: string | undefined;
						section?: IDepSection | undefined;
						ecosystem?: IPackageEcosystem | undefined;
					}) => {
						const result = await packageInstall(
							options.workspaceRootAbs,
							args,
						);
						if (result.error !== undefined) {
							return toolError(result.error);
						}
						return toolJson(result);
					},
				);
			},
		},
		{
			id: 'package_run_script',
			effects: ['write', 'spawn'],
			summary:
				'Run a package.json script via bun run (opt-in; the script itself may write/network).',
			tags: ['deps', 'write'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_package_run_script`,
					{
						description:
							'Run a package.json script (`bun run <script> [...args]`) and return {ok, code, timedOut, tail}. A non-zero exit is reported, not thrown. `cwd` is workspace-relative (default workspace root). Opt-in (plugins.deps.options.allowWrite:true).',
						inputSchema: z.object({
							script: z.string(),
							args: z.array(z.string()).optional(),
							cwd: z.string().optional(),
						}),
						outputSchema: z.object({
							ok: z.boolean(),
							command: z.string(),
							code: z.number(),
							timedOut: z.boolean(),
							tail: z.string(),
							error: z.string().optional(),
						}),
					},
					async (args: {
						script: string;
						args?: readonly string[] | undefined;
						cwd?: string | undefined;
					}) => {
						const result = await packageRunScript(
							options.workspaceRootAbs,
							args,
						);
						if (result.error !== undefined) {
							return toolError(result.error);
						}
						return toolJson(result);
					},
				);
			},
		},
	];
};
