/**
 * env-warning.interface.ts — where `init` learns which environment
 * variables the enabled plugins need.
 */

import type { IFinding } from '@delendai/core/public';
import type { IEnvRequirement } from '@delendai/env/public';

export interface IEnvWarningSources {
	/**
	 * Requirements known without importing the plugin, or undefined when
	 * the plugin is not catalogued. `[]` means catalogued and needing
	 * nothing — a different answer from "unknown".
	 */
	readonly catalogued: (
		pluginName: string,
	) => readonly IEnvRequirement[] | undefined;
	/** Ask the plugin itself. This imports its runtime. */
	readonly probe: (
		pluginName: string,
		hostEntryPath: string | undefined,
	) => Promise<readonly IEnvRequirement[]>;
}

/**
 * What `init` learned about the environment the selected plugins want.
 *
 * The requirements travel with the findings because a finding on its own
 * cannot say WHO wants the variable, and that is the whole difference
 * between a fact about a plugin and an accusation about the project.
 */
export interface IEnvWarningReport {
	/** Schema findings at high severity — a wrong shape, a bad value. */
	readonly findings: readonly IFinding[];
	/** Every requirement the selected plugins declared. */
	readonly requirements: readonly IEnvRequirement[];
	/** Variable names the project's `.env` actually defines. */
	readonly present?: ReadonlySet<string>;
}
