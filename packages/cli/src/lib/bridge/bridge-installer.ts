/**
 * bridge-installer.ts — b00239 S3.
 *
 * The workspace-local legacy bridge installer. Pure functions over an
 * injected IO surface so the same engine drives the `delendai bridge
 * status|install|remove` CLI and the unit / integration tests.
 *
 * ## Why this lives in the WORKSPACE, not under `<prefix>/bin/`
 *
 * The package's `package.json#bin` declares a single binary
 * (`delendai`) on purpose (S1): declaring a second name would let an
 * uninstalled `delendai` or `delendai` collide with the canonical
 * install and either fail the install or shadow it. Two implementations
 * of the same product on disk at the same time is the failure mode S1
 * explicitly forbids.
 *
 * So the bridge lives in the workspace, version-controlled (or
 * gitignored) as the project owner decides. The runner (`bridge
 * install`) writes the shims; the recogniser (`bridge status`) keeps
 * the marker so later `bridge remove` refuses to touch anything it
 * did not create.
 *
 * ## The four cases (per legacy bin name)
 *
 * absent        -> create the shim.
 * ours          -> no-op. Recognising our own is what makes a re-run
 *                  idempotent, and it is why every shim we create is
 *                  marked (see `BRIDGE_MARKER`).
 * foreign       -> do NOT touch it: not modified, not deleted, not
 *                  overwritten. Report it clearly and carry on.
 * unknown/error -> treat as foreign. The failure mode of guessing
 *                  wrong is deleting a stranger's file.
 *
 * These four cases are exactly the alias-manager's four cases, by
 * design — same load-bearing constraint, same vocabulary, same
 * recogniser. A user who has read the alias help should not have to
 * read a second help.
 */

import {
	BRIDGE_DIR_NAME,
	BRIDGE_MARKER,
} from '../../contracts/constants/bridge.constant';
import type {
	IBridgeDirectoryOutcome,
	IBridgeDirectoryStatus,
	IBridgeEnvironment,
	IBridgeInstallOutcome,
	IBridgeIo,
	IBridgeLegacyBinary,
	IBridgeShimStatus,
	IBridgeState,
} from '../../contracts/interfaces/bridge.interface';
import {
	BRIDGE_README_BODY,
	POSIX_BRIDGE_SHIM_BODY,
	WINDOWS_CMD_BRIDGE_SHIM_BODY,
	WINDOWS_PS1_BRIDGE_SHIM_BODY,
} from './shim-templates';

/**
 * Deduplicate a legacy-name list. The declared defaults may contain
 * duplicate strings. The current rebrand carries two distinct source
 * binaries (`mcp-vertex`, `mcpv`), but the installer still deduplicates at
 * module load so a future accidental duplicate cannot clobber the same path
 * twice. The `IBridgeLegacyBinary` type still permits the underlying values,
 * so a future rebrand that genuinely has two distinct names keeps the
 * existing call sites compiling.
 */
const dedupeLegacyNames = (
	list: readonly IBridgeLegacyBinary[],
): readonly IBridgeLegacyBinary[] => Array.from(new Set(list));

/**
 * The legacy bin names the installer handles by default, deduplicated.
 */
export const DEFAULT_BRIDGE_LEGACY_BINARIES: readonly IBridgeLegacyBinary[] =
	dedupeLegacyNames(['mcp-vertex', 'mcpv']);

/**
 * Where a legacy bin name lives in the bridge directory on a given
 * platform. POSIX gets a single file; Windows gets both a `.cmd` (for
 * `cmd.exe`) and a `.ps1` (for PowerShell scripts that pre-resolve
 * the script path).
 */
export const bridgeShimPaths = (
	legacyName: IBridgeLegacyBinary,
	env: IBridgeEnvironment,
	io: Pick<IBridgeIo, 'join'>,
): readonly string[] => {
	const dir = io.join(env.workspaceRoot, BRIDGE_DIR_NAME);
	return env.platform === 'win32'
		? [io.join(dir, `${legacyName}.cmd`), io.join(dir, `${legacyName}.ps1`)]
		: [io.join(dir, legacyName)];
};

/** The path where the installer's README lives. */
export const bridgeReadmePath = (
	env: IBridgeEnvironment,
	io: Pick<IBridgeIo, 'join'>,
): string => io.join(env.workspaceRoot, BRIDGE_DIR_NAME, 'README.md');

/** The bridge directory itself, regardless of platform. */
export const bridgeDirPath = (
	env: IBridgeEnvironment,
	io: Pick<IBridgeIo, 'join'>,
): string => io.join(env.workspaceRoot, BRIDGE_DIR_NAME);

/**
 * The shim body the installer writes for a given legacy name on a
 * given platform. Exposed so a future extension point (e.g.
 * user-supplied preludes) can compose without re-deriving the
 * platform → body mapping.
 */
export const renderBridgeShim = (
	legacyName: IBridgeLegacyBinary,
	env: IBridgeEnvironment,
): readonly {
	readonly path: string;
	readonly body: string;
	readonly crlf: boolean;
}[] => {
	const ctx = { legacyName, canonical: env.canonical };
	if (env.platform === 'win32') {
		return [
			{
				path: `${legacyName}.cmd`,
				body: WINDOWS_CMD_BRIDGE_SHIM_BODY(ctx),
				crlf: true,
			},
			{
				path: `${legacyName}.ps1`,
				body: WINDOWS_PS1_BRIDGE_SHIM_BODY(ctx),
				crlf: false,
			},
		];
	}
	return [
		{
			path: legacyName,
			body: POSIX_BRIDGE_SHIM_BODY(ctx),
			crlf: false,
		},
	];
};

/**
 * Read what currently occupies `legacyName` in the bridge directory.
 * Returns `absent` when nothing is there, `ours` when the marker
 * matches, `foreign` for any other content, `unreadable` when a
 * permissions problem blocks reading.
 */
export const readBridgeShimState = async (
	legacyName: IBridgeLegacyBinary,
	env: IBridgeEnvironment,
	io: IBridgeIo,
): Promise<IBridgeShimStatus> => {
	const paths = bridgeShimPaths(legacyName, env, io);
	for (const path of paths) {
		let contents: string | undefined;
		try {
			contents = await io.read(path);
		} catch {
			return { legacyName, paths, state: 'unreadable' };
		}
		if (contents === undefined) continue;
		if (contents.includes(BRIDGE_MARKER))
			return { legacyName, paths, state: 'ours' };
		return {
			legacyName,
			paths,
			state: 'foreign',
			occupiedBy: contents.split(/\r?\n/)[0]?.trim() ?? '(unknown)',
		};
	}
	return { legacyName, paths, state: 'absent' };
};

/** List every legacy name + their current state, in declaration order. */
export const readBridgeDirectoryStatus = async (
	env: IBridgeEnvironment,
	io: IBridgeIo,
): Promise<IBridgeDirectoryStatus> => {
	const names = dedupeLegacyNames(
		io.legacyNames ?? DEFAULT_BRIDGE_LEGACY_BINARIES,
	);
	const shims = await Promise.all(
		names.map((name) => readBridgeShimState(name, env, io)),
	);
	let readmePresent = false;
	try {
		readmePresent =
			(await io.read(bridgeReadmePath(env, io))) !== undefined;
	} catch {
		readmePresent = false;
	}
	return {
		bridgeDir: bridgeDirPath(env, io),
		canonical: env.canonical,
		shims,
		readmePresent,
	};
};

/**
 * Install one shim. Mirrors the alias-manager's four-case logic;
 * see its header for the rationale on why `foreign` and
 * `unreadable` short-circuit to `refused` rather than being guessed.
 */
export const installBridgeShim = async (
	legacyName: IBridgeLegacyBinary,
	env: IBridgeEnvironment,
	io: IBridgeIo,
): Promise<IBridgeInstallOutcome> => {
	const status = await readBridgeShimState(legacyName, env, io);

	if (status.state === 'ours') return { action: 'unchanged', status };

	if (status.state === 'foreign')
		return {
			action: 'refused',
			status,
			detail:
				`"${legacyName}" already exists in the bridge directory and was not created by this tool, ` +
				`so it was left untouched. "${env.canonical}" still works as the canonical command. ` +
				`Run \`delendai bridge status\` to see what is occupying it.`,
		};

	if (status.state === 'unreadable')
		return {
			action: 'refused',
			status,
			detail:
				`"${legacyName}" exists but could not be read, so it was left untouched rather than guessed at. ` +
				`"${env.canonical}" does not depend on the bridge.`,
		};

	try {
		const raws = renderBridgeShim(legacyName, env);
		const dir = bridgeDirPath(env, io);
		for (const raw of raws) {
			const absolute = io.join(dir, raw.path);
			const body = raw.crlf ? raw.body : raw.body;
			await io.write(absolute, body);
			if (env.platform !== 'win32') await io.makeExecutable?.(absolute);
		}
		return {
			action: 'created',
			status: { ...status, state: 'ours' },
		};
	} catch (error) {
		return {
			action: 'failed',
			status,
			detail:
				`Could not install the "${legacyName}" bridge shim (${String(error)}). ` +
				`This is not fatal: "${env.canonical}" still works as the canonical command.`,
		};
	}
};

/** Install every shim in declaration order, then write the README. */
export const installBridgeDirectory = async (
	env: IBridgeEnvironment,
	io: IBridgeIo,
): Promise<IBridgeDirectoryOutcome> => {
	const names = dedupeLegacyNames(
		io.legacyNames ?? DEFAULT_BRIDGE_LEGACY_BINARIES,
	);
	const perShim: IBridgeInstallOutcome[] = [];
	let anyActed = false;
	let anyRefused = false;
	let anyFailed = false;
	for (const name of names) {
		const outcome = await installBridgeShim(name, env, io);
		perShim.push(outcome);
		if (outcome.action === 'created') anyActed = true;
		if (outcome.action === 'refused') anyRefused = true;
		if (outcome.action === 'failed') anyFailed = true;
	}

	// Best-effort README. A failure here is non-fatal: the directory has
	// its purpose documented above every shim, but a write-protected
	// dir shouldn't block the install entirely.
	try {
		const readme = bridgeReadmePath(env, io);
		await io.write(readme, BRIDGE_README_BODY(env.canonical));
	} catch {
		// README is convenience, not contract.
	}

	const status = await readBridgeDirectoryStatus(env, io);

	if (anyFailed)
		return {
			action: 'failed',
			status,
			perShim,
			detail:
				'At least one bridge shim failed to install. See perShim.detail for the failing entry; canonical "' +
				env.canonical +
				'" still works as the canonical command.',
		};
	if (anyRefused && !anyActed)
		return {
			action: 'refused',
			status,
			perShim,
			detail:
				'Every bridge shim refused (all targets occupied by unknown content). Canonical "' +
				env.canonical +
				'" still works as the canonical command.',
		};
	if (anyActed)
		return {
			action: 'created',
			status,
			perShim,
		};
	return {
		action: 'unchanged',
		status,
		perShim,
	};
};

/** Remove every shim we can prove we created. Foreign shims are NEVER touched. */
export const removeBridgeDirectory = async (
	env: IBridgeEnvironment,
	io: IBridgeIo,
): Promise<IBridgeDirectoryOutcome> => {
	const names = dedupeLegacyNames(
		io.legacyNames ?? DEFAULT_BRIDGE_LEGACY_BINARIES,
	);
	const perShim: IBridgeInstallOutcome[] = [];
	let anyActed = false;
	let anyRefused = false;

	for (const name of names) {
		const status = await readBridgeShimState(name, env, io);
		if (status.state === 'absent') {
			perShim.push({ action: 'unchanged', status });
			continue;
		}
		if (status.state !== 'ours') {
			anyRefused = true;
			perShim.push({
				action: 'refused',
				status,
				detail: `"${name}" was not created by this tool, so it was not removed.`,
			});
			continue;
		}
		try {
			for (const path of status.paths) {
				if (await io.exists(path)) await io.remove(path);
			}
			anyActed = true;
			perShim.push({
				action: 'created',
				status: { ...status, state: 'absent' },
			});
		} catch (error) {
			perShim.push({
				action: 'failed',
				status,
				detail: `could not remove "${name}" (${String(error)}).`,
			});
		}
	}

	const status = await readBridgeDirectoryStatus(env, io);

	// Best-effort removal of the README we wrote. The README is
	// package-versioned and not subject to foreign writes, so it is
	// always safe to clear alongside the shims. A failure here is
	// non-fatal — a stale README in an otherwise empty bridge directory
	// is a footprint a subsequent `bridge status` will surface.
	try {
		const readme = bridgeReadmePath(env, io);
		if (await io.exists(readme)) await io.remove(readme);
	} catch {
		// Permission-protected directory; user can remove by hand.
	}

	if (anyRefused && !anyActed)
		return {
			action: 'refused',
			status,
			perShim,
			detail: 'No bridge shim was ours to remove — every entry was foreign or unreadable.',
		};
	if (anyActed) return { action: 'created', status, perShim };
	return { action: 'unchanged', status, perShim };
};

/** Convenience: resolve state to one of the canonical strings used in the CLI. */
export const stateLabel = (state: IBridgeState): string =>
	state === 'absent'
		? 'absent'
		: state === 'ours'
			? 'ours'
			: state === 'foreign'
				? 'foreign'
				: 'unreadable';
