/**
 * probe.ts — r00012 S1: a pure external-tool presence/version probe over an
 * injected `IProbeDeps`, plus the production adapter `realProbeDeps()`. The
 * one place tool discovery lives: consumers pass a descriptor and get a
 * uniform `IToolProbeResult` with an install hint when the tool is absent.
 */
import { execFile } from 'node:child_process';

import type {
	IExternalTool,
	IProbeDeps,
	IToolProbeResult,
} from '../contracts/interfaces/external-tool.interface';
import { runArgv } from '../shared/run-command';

/**
 * Probe one tool. Never throws: an absent binary yields
 * `{available:false, installHint}`; a present one yields its parsed version
 * when `versionPattern` matches (else the trimmed raw output).
 */
export const probeTool = async (
	tool: IExternalTool,
	deps: IProbeDeps,
): Promise<IToolProbeResult> => {
	const installHints = tool.installHints ?? [];
	const available = await deps.commandExists(tool.bin);
	if (!available) {
		const first = installHints[0];
		return {
			tool: tool.id,
			available: false,
			installHints,
			...(first !== undefined ? { installHint: first } : {}),
		};
	}
	const versionArgs = tool.versionArgs ?? ['--version'];
	const raw = await deps.runVersion(tool.bin, versionArgs).catch(() => '');
	const parsed =
		tool.versionPattern !== undefined
			? (tool.versionPattern.exec(raw)?.[1] ?? undefined)
			: raw.trim() === ''
				? undefined
				: raw.trim();
	return {
		tool: tool.id,
		available: true,
		installHints,
		...(parsed !== undefined ? { version: parsed } : {}),
	};
};

/** Probe many tools concurrently. Output order matches the input. */
export const probeTools = (
	tools: readonly IExternalTool[],
	deps: IProbeDeps,
): Promise<IToolProbeResult[]> =>
	Promise.all(tools.map((tool) => probeTool(tool, deps)));

/**
 * True when `bin` resolves on PATH. Uses `bash -c 'command -v "$1"'` with a
 * hard 3s timeout; `bin` is an argv element, never interpolated, so a
 * crafted name cannot inject. Windows falls back to `where`.
 */
const commandExists = (bin: string): Promise<boolean> =>
	new Promise((resolve) => {
		if (process.platform === 'win32') {
			execFile('where', [bin], { timeout: 3000 }, (error) =>
				resolve(error === null),
			);
			return;
		}
		execFile(
			'/bin/bash',
			['--noprofile', '--norc', '-c', 'command -v "$1"', 'probe', bin],
			{ timeout: 3000 },
			(error) => resolve(error === null),
		);
	});

/** Production probe deps: real PATH probe + argv version runner. */
export const realProbeDeps = (): IProbeDeps => ({
	commandExists,
	runVersion: async (bin, args) => {
		const outcome = await runArgv([bin, ...args], {
			timeoutMs: 3000,
			maxOutputBytes: 4096,
		});
		return `${outcome.stdout}${outcome.stderr}`;
	},
});
