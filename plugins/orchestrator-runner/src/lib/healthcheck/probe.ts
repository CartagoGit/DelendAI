/**
 * probe.ts — PATH detection for a provider CLI.
 *
 * Probing runs `command -v <cli>` (POSIX) to learn whether a CLI is
 * installed and where. The command runner is INJECTED so tests never spawn
 * a real subprocess and the hot path stays async (AGENTS.md rule 3 — no
 * sync child-process on a request path). Never uses `process.cwd()`: the
 * caller passes the workspace root as `cwd`.
 *
 * Only cli/mcp-server providers have a command to probe; api/subscription
 * providers report `installed: null`-shaped results via the report builder,
 * not here.
 */
import type { ICliProbeResult } from '../types';

/** Minimal shape of a command runner (subset of core `runCommand`). */
export type ProbeRunner = (
	command: string,
	options: { readonly cwd: string; readonly timeoutMs?: number },
) => Promise<{ readonly code: number; readonly output: string }>;

/**
 * Probe a single CLI command. Returns `installed:false` when `command -v`
 * exits non-zero; otherwise captures the resolved path and a best-effort
 * `--version` string. Version probing failure is non-fatal (version stays
 * `null`).
 */
export const probeCli = async (
	command: string,
	runner: ProbeRunner,
	cwd: string,
): Promise<ICliProbeResult> => {
	const which = await runner(`command -v ${command}`, {
		cwd,
		timeoutMs: 5000,
	});
	if (which.code !== 0) {
		return { installed: false, path: null, version: null };
	}
	const path = which.output.trim().split('\n')[0]?.trim() ?? null;

	let version: string | null = null;
	try {
		const ver = await runner(`${command} --version`, {
			cwd,
			timeoutMs: 5000,
		});
		if (ver.code === 0) {
			version = ver.output.trim().split('\n')[0]?.trim() ?? null;
		}
	} catch {
		version = null;
	}

	return { installed: true, path: path === '' ? null : path, version };
};
