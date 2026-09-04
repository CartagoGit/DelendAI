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

import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';
import type {
	IAliasEnvironment,
	IAliasIo,
	IAliasOutcome,
	IAliasStatus,
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
