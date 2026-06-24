/**
 * loop-detector-config.ts — Solid SRP extraction.
 *
 * Resolves the `ILoopDetectorServiceOptions` for `AgentLoopDetectorService`
 * from THREE independent sources (defaults, on-disk config file, CLI
 * overrides), using the canonical precedence: **CLI > file > defaults**.
 *
 * Before this split, the constructor of `AgentLoopDetectorService` mixed
 * three responsibilities — config resolution, path derivation, and
 * orchestration state — which made it impossible to test the precedence
 * rules in isolation and forced the constructor to do boot-time file
 * I/O. With this module:
 *
 *   1. **SRP**: `AgentLoopDetectorService` now orchestrates; this module
 *      resolves config. They can evolve independently.
 *   2. **DIP**: callers pass `IWorkspacePathProvider` + an optional
 *      `IConfigFileReader` instead of hard-coding `node:fs`.
 *   3. **LSP**: any class that satisfies `IConfigFileReader` works —
 *      tests inject a stub, production uses `node:fs` via
 *      `createFsConfigFileReader()`.
 */
import { readFile } from 'node:fs/promises';

import {
	parseConfigFile,
	type IMcpVertexConfigFile,
	type IWorkspacePathProvider,
} from '@mcp-vertex/core/public';

/** The fully-resolved options consumed by `AgentLoopDetectorService`. */
export interface ILoopDetectorServiceOptions {
	enabled: boolean;
	repeatThreshold: number;
	nearRepeatThreshold: number;
	similarityThreshold: number;
	idleThreshold: number;
	noProgressThreshold: number;
	ringSize: number;
	gitCheckTools: readonly string[];
	handoffDir: string;
	handoffTtlDays: number;
	notifyOnDetect: boolean;
	/**
	 * Agent names or glob patterns the detector MUST ignore. The
	 * detector was originally tuned for swarm runs where the same
	 * `edit_file` call 3 times in a row is unambiguous stuck. But
	 * interactive host sessions (`copilot-default`, `cursor-default`,
	 * etc.) legitimately invoke the same orient tool multiple times —
	 * the threshold that catches a swarm stall produces false
	 * positives for the human in the loop. Defaults to the common
	 * `*-default` / `default-*` / `host` / `interactive` patterns;
	 * set to `[]` in the config to opt back into universal monitoring.
	 */
	interactiveAgentPatterns: readonly string[];
}

/**
 * Read-only dependency for resolving the loop detector's on-disk config.
 * Solid DIP: the resolver does NOT import `node:fs`; it receives a
 * reader. Production wires `createFsConfigFileReader()`; tests inject a
 * stub that returns canned JSON.
 */
export interface IConfigFileReader {
	/** Return the parsed config object, or `undefined` if the file is absent. */
	readGlobalConfig(): Promise<IMcpVertexConfigFile>;
}

/** Production reader: reads `mcp-vertex.config.json` from the workspace. */
export const createFsConfigFileReader = async (
	workspace: IWorkspacePathProvider,
): Promise<IConfigFileReader> => {
	const path = workspace.resolve('mcp-vertex.config.json');
	return {
		async readGlobalConfig() {
			try {
				return parseConfigFile(await readFile(path, 'utf8'));
			} catch {
				// Corrupt/missing — fall through to defaults. Matches the
				// pre-split behaviour (a corrupt config never crashes boot).
				return {};
			}
		},
	};
};

/** Inputs to the pure resolver — every dependency is injected. */
export interface IResolveLoopDetectorConfigInput {
	/** Caller-injected file reader. Required (no implicit fs). */
	readonly configReader: IConfigFileReader;
	/** CLI args bag (`ctx.args`). May be empty. */
	readonly cliArgs: Readonly<Record<string, string>>;
}

/** Default option values shipped with the plugin. */
export const LOOP_DETECTOR_DEFAULTS: ILoopDetectorServiceOptions = {
	enabled: true,
	// 8 is empirically high enough that interactive re-orient calls
	// (`continue_proposal`, `round_context`) do not trip it, while a
	// swarm agent that calls the same edit_file 8 times in a row is
	// unambiguously stuck. Hosts can still tune per environment.
	repeatThreshold: 8,
	nearRepeatThreshold: 5,
	similarityThreshold: 0.9,
	idleThreshold: 3,
	noProgressThreshold: 3,
	ringSize: 50,
	gitCheckTools: [
		'edit_file',
		'write_file',
		'multi_replace_string_in_file',
		'replace_string_in_file',
	],
	handoffDir: '.mcp-vertex/handoff',
	handoffTtlDays: 7,
	notifyOnDetect: true,
	// Universal host-session shapes — Copilot, Cursor, Windsurf and
	// any host that calls its user-facing session `*-default`. Hosts
	// whose interactive session is named differently can extend this
	// list from the config file (`loopDetector.interactiveAgentPatterns`).
	interactiveAgentPatterns: ['*-default', 'default-*', 'host', 'interactive'],
};

/**
 * Parse CLI overrides from the args bag. Exported so the spec can pin
 * the precedence rules without booting a full resolver.
 *
 * Solid: pure function over inputs (no I/O, no globals).
 */
export const parseLoopDetectorCliOverrides = (
	args: Readonly<Record<string, string>>,
): Partial<ILoopDetectorServiceOptions> => {
	const out: Partial<ILoopDetectorServiceOptions> = {};
	if (
		args['no-loop-detector'] === 'true' ||
		args['loop-detector'] === 'false'
	) {
		out.enabled = false;
	} else if (args['loop-detector'] === 'true') {
		out.enabled = true;
	}
	for (const [key, val] of Object.entries(args)) {
		if (!key.startsWith('loop-detector.')) continue;
		const subKey = key.slice('loop-detector.'.length);
		if (subKey === 'enabled') {
			out.enabled = val === 'true' || val === '1';
		} else if (
			subKey === 'repeat-threshold' ||
			subKey === 'repeatThreshold'
		) {
			out.repeatThreshold = Number(val);
		} else if (
			subKey === 'near-repeat-threshold' ||
			subKey === 'nearRepeatThreshold'
		) {
			out.nearRepeatThreshold = Number(val);
		} else if (
			subKey === 'similarity-threshold' ||
			subKey === 'similarityThreshold'
		) {
			out.similarityThreshold = Number(val);
		} else if (subKey === 'idle-threshold' || subKey === 'idleThreshold') {
			out.idleThreshold = Number(val);
		} else if (
			subKey === 'no-progress-threshold' ||
			subKey === 'noProgressThreshold'
		) {
			out.noProgressThreshold = Number(val);
		} else if (subKey === 'ring-size' || subKey === 'ringSize') {
			out.ringSize = Number(val);
		} else if (subKey === 'handoff-dir' || subKey === 'handoffDir') {
			out.handoffDir = val;
		} else if (
			subKey === 'handoff-ttl-days' ||
			subKey === 'handoffTtlDays'
		) {
			out.handoffTtlDays = Number(val);
		} else if (
			subKey === 'notify-on-detect' ||
			subKey === 'notifyOnDetect'
		) {
			out.notifyOnDetect = val === 'true' || val === '1';
		} else if (
			subKey === 'interactive-agent-patterns' ||
			subKey === 'interactiveAgentPatterns'
		) {
			// CLI accepts a comma-separated list. Empty list ("")
			// is treated as "explicit opt-out of all ignore rules".
			out.interactiveAgentPatterns =
				val === '' ? [] : val.split(',').map((p) => p.trim());
		}
	}
	return out;
};

/**
 * Solid: pure over its inputs (configReader + cliArgs + defaults).
 * Precedence: CLI > on-disk config > defaults. The boot-time fs read
 * lives inside `configReader` — the resolver itself never imports
 * `node:fs`.
 */
export const resolveLoopDetectorConfig = (
	input: IResolveLoopDetectorConfigInput,
): Promise<ILoopDetectorServiceOptions> =>
	input.configReader
		.readGlobalConfig()
		.then((globalConfig) =>
			resolveLoopDetectorConfigFromFileConfig(
				globalConfig,
				input.cliArgs,
			),
		);

export const resolveLoopDetectorConfigFromFileConfig = (
	globalConfig: IMcpVertexConfigFile,
	cliArgs: Readonly<Record<string, string>>,
): ILoopDetectorServiceOptions => {
	const cliConfig = parseLoopDetectorCliOverrides(cliArgs);
	const loop = globalConfig.loopDetector;

	return {
		enabled:
			cliConfig.enabled ??
			loop?.enabled ??
			LOOP_DETECTOR_DEFAULTS.enabled,
		repeatThreshold:
			cliConfig.repeatThreshold ??
			loop?.repeatThreshold ??
			LOOP_DETECTOR_DEFAULTS.repeatThreshold,
		nearRepeatThreshold:
			cliConfig.nearRepeatThreshold ??
			loop?.nearRepeatThreshold ??
			LOOP_DETECTOR_DEFAULTS.nearRepeatThreshold,
		similarityThreshold:
			cliConfig.similarityThreshold ??
			loop?.similarityThreshold ??
			LOOP_DETECTOR_DEFAULTS.similarityThreshold,
		idleThreshold:
			cliConfig.idleThreshold ??
			loop?.idleThreshold ??
			LOOP_DETECTOR_DEFAULTS.idleThreshold,
		noProgressThreshold:
			cliConfig.noProgressThreshold ??
			loop?.noProgressThreshold ??
			LOOP_DETECTOR_DEFAULTS.noProgressThreshold,
		ringSize:
			cliConfig.ringSize ??
			loop?.ringSize ??
			LOOP_DETECTOR_DEFAULTS.ringSize,
		gitCheckTools:
			cliConfig.gitCheckTools ??
			loop?.gitCheckTools ??
			LOOP_DETECTOR_DEFAULTS.gitCheckTools,
		handoffDir:
			cliConfig.handoffDir ??
			loop?.handoffDir ??
			LOOP_DETECTOR_DEFAULTS.handoffDir,
		handoffTtlDays:
			cliConfig.handoffTtlDays ??
			loop?.handoffTtlDays ??
			LOOP_DETECTOR_DEFAULTS.handoffTtlDays,
		notifyOnDetect:
			cliConfig.notifyOnDetect ??
			loop?.notifyOnDetect ??
			LOOP_DETECTOR_DEFAULTS.notifyOnDetect,
		interactiveAgentPatterns:
			cliConfig.interactiveAgentPatterns ??
			loop?.interactiveAgentPatterns ??
			LOOP_DETECTOR_DEFAULTS.interactiveAgentPatterns,
	};
};
