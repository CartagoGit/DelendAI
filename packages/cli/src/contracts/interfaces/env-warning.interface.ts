/**
 * env-warning.interface.ts — where `init` learns which environment
 * variables the enabled plugins need.
 */

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
