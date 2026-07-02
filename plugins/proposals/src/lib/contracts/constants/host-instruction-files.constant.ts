/**
 * host-instruction-files.constant.ts — f00094 S1/S2.
 *
 * The hand-maintained scan-surface table `scanHostInstructions` reads.
 * There is no glob and no fuzzy match: adding support for a new host is
 * a one-line addition to one of these tables, nothing else.
 *
 * Surface table (f00094 §architecture):
 *
 * | Path                              | Surface   | Default scope        |
 * |-----------------------------------|-----------|----------------------|
 * | AGENTS.md                         | in-repo   | always read          |
 * | CLAUDE.md                         | in-repo   | always read          |
 * | .github/copilot-instructions.md   | in-repo   | always read          |
 * | ~/.cursorrules                    | user-home | only on scope: 'all' |
 * | ~/.aider.conf.yml                 | user-home | only on scope: 'all' |
 * | ~/.claude.json                    | user-home | only on scope: 'all' |
 * | ~/.codex/config.toml              | user-home | only on scope: 'all' |
 * | ~/.continue/config.json           | user-home | only on scope: 'all' |
 *
 * `user-home` paths are opt-in because they live OUTSIDE the workspace
 * containment boundary (AGENTS.md hard rule): the in-repo paths are
 * always safe to read, the home paths only when the caller explicitly
 * asks with `scope: 'all'`.
 */
import type { IHostFileTarget } from '../interfaces/host-instructions-inventory.interface';

/**
 * The three checked-in host files, always scanned. Order is stable so
 * the emitted proposal lists them the same way every run. Mirrors
 * `HOST_FILE_TARGETS` in the CLI's f00093 snapshot service (the in-repo
 * counterpart), kept independent to avoid a cross-package import.
 */
export const IN_REPO_HOST_FILES: readonly IHostFileTarget[] = [
	{ path: 'AGENTS.md', surface: 'in-repo' },
	{ path: 'CLAUDE.md', surface: 'in-repo' },
	{ path: '.github/copilot-instructions.md', surface: 'in-repo' },
];

/**
 * Host-specific config that lives in the user's home directory. Paths
 * are relative to `$HOME`; the reader resolves them against the home
 * root with a containment guard so a symlinked home can never escape
 * the boundary. Opt-in via `scope: 'all'`.
 */
export const USER_HOME_HOST_FILES: readonly IHostFileTarget[] = [
	{ path: '.cursorrules', surface: 'user-home' },
	{ path: '.aider.conf.yml', surface: 'user-home' },
	{ path: '.claude.json', surface: 'user-home' },
	{ path: '.codex/config.toml', surface: 'user-home' },
	{ path: '.continue/config.json', surface: 'user-home' },
];
