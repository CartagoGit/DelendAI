/**
 * alias-manager.ts — b00239 S1.
 *
 * Provisions the short human alias for the CLI without ever risking the
 * install.
 *
 * ## Why the alias is not declared in `package.json#bin`
 *
 * A `bin` entry is a hard claim on a name. If the name is already taken by
 * other software, npm/bun can fail the whole installation — so declaring
 * both the canonical binary and a short, collision-prone alias means the
 * alias can take the product down with it. The canonical binary is the
 * only contract; the alias is convenience, and convenience must never be
 * load-bearing.
 *
 * So `bin` declares the canonical name alone, and the alias is provisioned
 * afterwards, best-effort, by this module.
 *
 * ## Why it does not depend on the lifecycle script
 *
 * Lifecycle scripts are disabled in an increasing number of installs
 * (`--ignore-scripts`, CI hardening, some corporate registries). A design
 * whose correctness depends on one is a design that is silently wrong in
 * those environments. So the postinstall hook is an optimisation, and the
 * CLI reconciles the alias on its first run regardless — running twice is
 * cheap because the reconciliation is idempotent.
 *
 * ## The four cases
 *
 * absent        → create the alias.
 * ours          → do nothing. Recognising our own is what makes a re-run
 *                 idempotent, and it is why every alias we create is
 *                 marked (see `ALIAS_MARKER`).
 * foreign       → do NOT touch it: not modified, not deleted, not
 *                 overwritten. Report it, clearly, and carry on — the CLI
 *                 is fully usable under its canonical name.
 * unknown/error → treat as foreign. The failure mode of guessing wrong is
 *                 deleting somebody else's executable, so the tie goes to
 *                 leaving it alone.
 */

import {
	ALIAS_MARKER,
	LAUNCHER_NAME,
} from '../../contracts/constants/alias.constant';
import type {
	IAliasEnvironment,
	IAliasIo,
	IAliasOutcome,
	IAliasStatus,
	ILauncherEnvironment,
} from '../../contracts/interfaces/alias.interface';

export { ALIAS_MARKER };
export type {
	IAliasAction,
	IAliasEnvironment,
	IAliasIo,
	IAliasOutcome,
	IAliasState,
	IAliasStatus,
} from '../../contracts/interfaces/alias.interface';

/**
 * The files an alias occupies on a given platform.
 *
 * Windows resolves executables through extensions on `PATHEXT`, so a bare
 * extensionless file is not runnable from `cmd` and a `.cmd` shim is not
 * seen by PowerShell scripts that call the bare name. Both are written,
 * which is what "not a Unix-only solution" means concretely.
 */
export const aliasPaths = (
	alias: string,
	env: IAliasEnvironment,
	io: Pick<IAliasIo, 'join'>,
): readonly string[] =>
	env.platform === 'win32'
		? [
				io.join(env.binDir, `${alias}.cmd`),
				io.join(env.binDir, `${alias}.ps1`),
			]
		: [io.join(env.binDir, alias)];

/** Shim contents for one alias path. Marked, so we can recognise it later. */
export const renderAlias = (path: string, env: IAliasEnvironment): string => {
	if (path.endsWith('.cmd'))
		return [
			'@echo off',
			`:: ${ALIAS_MARKER}`,
			`node "${env.canonicalPath}" %*`,
			'',
		].join('\r\n');
	if (path.endsWith('.ps1'))
		return [
			`# ${ALIAS_MARKER}`,
			`node "${env.canonicalPath}" @args`,
			'',
		].join('\r\n');
	return [
		'#!/bin/sh',
		`# ${ALIAS_MARKER}`,
		`exec node "${env.canonicalPath}" "$@"`,
		'',
	].join('\n');
};

/** What currently occupies the alias name. */
export const readAliasState = async (
	alias: string,
	env: IAliasEnvironment,
	io: IAliasIo,
): Promise<IAliasStatus> => {
	const paths = aliasPaths(alias, env, io);
	const primary = paths[0];
	for (const path of paths) {
		let contents: string | undefined;
		try {
			contents = await io.read(path);
		} catch {
			// Present but unreadable: a permissions problem, a directory,
			// a broken link. Not ours to judge and not ours to replace.
			return {
				alias,
				canonical: env.canonicalPath,
				state: 'unreadable',
				path,
			};
		}
		if (contents === undefined) continue;
		if (contents.includes(ALIAS_MARKER))
			return { alias, canonical: env.canonicalPath, state: 'ours', path };
		return {
			alias,
			canonical: env.canonicalPath,
			state: 'foreign',
			path,
			occupiedBy: contents.split('\n')[0]?.trim() ?? '(unknown)',
		};
	}
	return {
		alias,
		canonical: env.canonicalPath,
		state: 'absent',
		path: primary,
	};
};

/**
 * Create the alias if the name is free or already ours.
 *
 * Never throws for a conflict: a conflict is a supported outcome, not an
 * error. The caller is expected to report `refused` and continue.
 */
export const installAlias = async (
	alias: string,
	env: IAliasEnvironment,
	io: IAliasIo,
): Promise<IAliasOutcome> => {
	const status = await readAliasState(alias, env, io);

	if (status.state === 'ours') return { action: 'unchanged', status };

	if (status.state === 'foreign')
		return {
			action: 'refused',
			status,
			detail:
				`"${alias}" already exists and was not created by this tool, so it was left untouched. ` +
				`Use "${basename(env.canonicalPath)}" instead — it is the canonical command and is fully functional. ` +
				`To see what holds the name: "${basename(env.canonicalPath)} alias status".`,
		};

	if (status.state === 'unreadable')
		return {
			action: 'refused',
			status,
			detail:
				`"${alias}" exists but could not be read, so it was left untouched rather than guessed at. ` +
				`Use "${basename(env.canonicalPath)}", which does not depend on the alias.`,
		};

	try {
		for (const path of aliasPaths(alias, env, io)) {
			await io.write(path, renderAlias(path, env));
			if (env.platform !== 'win32') await io.makeExecutable?.(path);
		}
		return {
			action: 'created',
			status: { ...status, state: 'ours' },
		};
	} catch (error) {
		// A failed alias is a missing convenience, never a failed install.
		return {
			action: 'failed',
			status,
			detail:
				`could not create the "${alias}" alias (${String(error)}). ` +
				`This is not fatal: "${basename(env.canonicalPath)}" works regardless.`,
		};
	}
};

/** Remove the alias, but only when we can prove we created it. */
export const removeAlias = async (
	alias: string,
	env: IAliasEnvironment,
	io: IAliasIo,
): Promise<IAliasOutcome> => {
	const status = await readAliasState(alias, env, io);
	if (status.state === 'absent') return { action: 'unchanged', status };
	if (status.state !== 'ours')
		return {
			action: 'refused',
			status,
			detail: `"${alias}" was not created by this tool, so it will not be removed.`,
		};
	try {
		for (const path of aliasPaths(alias, env, io)) {
			if (await io.exists(path)) await io.remove(path);
		}
		return { action: 'created', status: { ...status, state: 'absent' } };
	} catch (error) {
		return {
			action: 'failed',
			status,
			detail: `could not remove the "${alias}" alias (${String(error)}).`,
		};
	}
};

const basename = (path: string): string =>
	path
		.split(/[\\/]/u)
		.at(-1)
		?.replace(/\.[cm]?js$/u, '') ?? path;

/**
 * The checkout launcher (`bun run cli:link`).
 *
 * One `delendai` executable in the user's global bin that picks the CLI to
 * run from where the shell is: a delendai checkout's own source, else the
 * project's installed binary, else the checkout that wrote the launcher.
 * It carries `ALIAS_MARKER`, so a rerun is idempotent and a file without
 * the marker is never overwritten.
 */
export const launcherPath = (
	env: ILauncherEnvironment,
	io: Pick<IAliasIo, 'join'>,
): string =>
	io.join(
		env.binDir,
		env.platform === 'win32' ? `${LAUNCHER_NAME}.cmd` : LAUNCHER_NAME,
	);

export const renderLauncher = (env: ILauncherEnvironment): string => {
	if (env.platform === 'win32')
		return [
			'@echo off',
			`:: ${ALIAS_MARKER}`,
			'setlocal',
			`set "FALLBACK=${env.checkoutRoot}"`,
			'set "DIR=%CD%"',
			':walk',
			'if exist "%DIR%\\packages\\cli\\src\\index.ts" if exist "%DIR%\\packages\\cli\\package.json" (',
			'  findstr /c:"\\"name\\": \\"@delendai/cli\\"" "%DIR%\\packages\\cli\\package.json" >nul 2>&1 && (bun "%DIR%\\packages\\cli\\src\\index.ts" %* & exit /b %errorlevel%)',
			')',
			'if exist "%DIR%\\node_modules\\.bin\\delendai.cmd" (call "%DIR%\\node_modules\\.bin\\delendai.cmd" %* & exit /b %errorlevel%)',
			'for %%I in ("%DIR%\\..") do set "PARENT=%%~fI"',
			'if /i "%PARENT%"=="%DIR%" goto fallback',
			'set "DIR=%PARENT%"',
			'goto walk',
			':fallback',
			'bun "%FALLBACK%\\packages\\cli\\src\\index.ts" %*',
			'',
		].join('\r\n');
	return [
		'#!/usr/bin/env bash',
		`# ${ALIAS_MARKER}`,
		"# delendai launcher: the CLI of the project you are in, else this machine's checkout.",
		"#  1. inside a delendai checkout (or one of its worktrees): that checkout's source",
		'#  2. inside a project that installs delendai: its node_modules/.bin/delendai',
		'#  3. anywhere else: the checkout below',
		`FALLBACK='${env.checkoutRoot.replace(/'/gu, `'\\''`)}'`,
		'dir=$PWD',
		'while :; do',
		'\tif [ -f "$dir/packages/cli/src/index.ts" ] && grep -q \'"name": "@delendai/cli"\' "$dir/packages/cli/package.json" 2>/dev/null; then',
		'\t\texec bun "$dir/packages/cli/src/index.ts" "$@"',
		'\tfi',
		'\tif [ -x "$dir/node_modules/.bin/delendai" ]; then',
		'\t\texec "$dir/node_modules/.bin/delendai" "$@"',
		'\tfi',
		'\t[ "$dir" = / ] && break',
		'\tdir=$(dirname "$dir")',
		'done',
		'exec bun "$FALLBACK/packages/cli/src/index.ts" "$@"',
		'',
	].join('\n');
};

/** Write the launcher unless something that is not ours holds the name. */
export const installLauncher = async (
	env: ILauncherEnvironment,
	io: IAliasIo,
): Promise<IAliasOutcome> => {
	const path = launcherPath(env, io);
	const status = (state: IAliasStatus['state']): IAliasStatus => ({
		alias: LAUNCHER_NAME,
		canonical: env.checkoutRoot,
		state,
		path,
	});
	let existing: string | undefined;
	try {
		existing = await io.read(path);
	} catch {
		return {
			action: 'refused',
			status: status('unreadable'),
			detail: `${path} exists but could not be read, so it was left untouched.`,
		};
	}
	if (existing !== undefined && !existing.includes(ALIAS_MARKER))
		return {
			action: 'refused',
			status: {
				...status('foreign'),
				occupiedBy: existing.split('\n')[0]?.trim() ?? '(unknown)',
			},
			detail: `${path} was not written by this tool, so it was not overwritten. Move it aside and run cli:link again.`,
		};
	const next = renderLauncher(env);
	if (existing === next)
		return { action: 'unchanged', status: status('ours') };
	try {
		await io.write(path, next);
		if (env.platform !== 'win32') await io.makeExecutable?.(path);
		return { action: 'created', status: status('ours') };
	} catch (error) {
		return {
			action: 'failed',
			status: status('absent'),
			detail: `could not write ${path} (${String(error)}).`,
		};
	}
};

/** Where `bun add -g` (else `npm i -g`) puts executables. */
export const resolveGlobalBinDir = async (
	platform: 'win32' | 'posix',
	vars: Readonly<Record<string, string | undefined>>,
	io: Pick<IAliasIo, 'exists' | 'join'>,
): Promise<string | undefined> => {
	const home = vars.HOME ?? vars.USERPROFILE;
	const bunRoot = vars.BUN_INSTALL
		? vars.BUN_INSTALL
		: home
			? io.join(home, '.bun')
			: undefined;
	if (bunRoot !== undefined) {
		const bunBin = io.join(bunRoot, 'bin');
		if (await io.exists(bunBin)) return bunBin;
	}
	const npmPrefix = vars.NPM_CONFIG_PREFIX ?? vars.npm_config_prefix;
	if (npmPrefix !== undefined && npmPrefix.length > 0)
		return platform === 'win32' ? npmPrefix : io.join(npmPrefix, 'bin');
	return bunRoot === undefined ? undefined : io.join(bunRoot, 'bin');
};

/** Remove the launcher, only when the marker proves it is ours. */
export const removeLauncher = async (
	env: ILauncherEnvironment,
	io: IAliasIo,
): Promise<IAliasOutcome> => {
	const path = launcherPath(env, io);
	const state = (s: IAliasStatus['state']): IAliasStatus => ({
		alias: LAUNCHER_NAME,
		canonical: env.checkoutRoot,
		state: s,
		path,
	});
	let existing: string | undefined;
	try {
		existing = await io.read(path);
	} catch {
		return { action: 'refused', status: state('unreadable') };
	}
	if (existing === undefined)
		return { action: 'unchanged', status: state('absent') };
	if (!existing.includes(ALIAS_MARKER))
		return {
			action: 'refused',
			status: state('foreign'),
			detail: `${path} was not written by this tool, so it will not be removed.`,
		};
	await io.remove(path);
	return { action: 'created', status: state('absent') };
};
