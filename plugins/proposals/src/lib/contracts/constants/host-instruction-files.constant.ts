/**
 * host-instruction-files.constant.ts — f00094 S1/S2.
 *
 * The scan-surface table `scanHostInstructions` reads. There is no glob
 * and no fuzzy match: the in-repo files come from core's host catalog,
 * the home ones are listed here.
 *
 * Surface table (f00094 §architecture):
 *
 * | Path                              | Surface   | Default scope        |
 * |-----------------------------------|-----------|----------------------|
 * | each host's instructions files    | in-repo   | always read          |
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
import { AGENT_HOST_INSTRUCTION_FILES } from '@delendai/core/contracts';

import type { IHostFileTarget } from '../interfaces/host-instructions-inventory.interface';

/**
 * Every checked-in file a host reads instructions from, always scanned,
 * read from core's `AGENT_HOSTS` so a host declared there is scanned with
 * no edit here. Catalog order, so the emitted proposal lists them the
 * same way every run.
 */
export const IN_REPO_HOST_FILES: readonly IHostFileTarget[] =
	AGENT_HOST_INSTRUCTION_FILES.map(({ path }) => ({
		path,
		surface: 'in-repo' as const,
	}));

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
