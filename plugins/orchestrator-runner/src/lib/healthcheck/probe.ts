/**
 * probe.ts — PATH detection for a provider CLI.
 *
 * Probing runs `command -v <cli>` (POSIX), through core's one probe, to
 * learn whether a CLI is installed and where. The command runner is INJECTED so tests never spawn
 * a real subprocess and the hot path stays async (AGENTS.md rule 3 — no
 * sync child-process on a request path). Never uses `process.cwd()`: the
 * caller passes the workspace root as `cwd`.
 *
 * Only cli/mcp-server providers have a command to probe; api/subscription
 * providers report `installed: null`-shaped results via the report builder,
 * not here.
 */
import { probeClientCommand } from '@delendai/core/runtime';
import type { IClientCommandRunner } from '@delendai/core/contracts';

import type { ICliProbeResult } from '../types';

/** Minimal shape of a command runner (subset of core `runCommand`). */
export type ProbeRunner = IClientCommandRunner;

/**
 * Probe a single CLI command: whether it is on PATH, where, and its
 * version. Core answers it for every consumer (`probeClientCommand`), so
 * this plugin and `auto-agent-selector` read a machine the same way.
 */
export const probeCli = (
	command: string,
	runner: ProbeRunner,
	cwd: string,
): Promise<ICliProbeResult> => probeClientCommand(command, runner, cwd);
