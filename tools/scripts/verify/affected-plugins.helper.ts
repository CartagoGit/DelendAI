/**
 * affected-plugins.helper.ts — the plugins whose tools a change can alter.
 *
 * Verifying every plugin's tools took about two minutes on each pull
 * request, including one that changed only the CLI, which no plugin
 * loads. A plugin is verified when the change reaches one of its files,
 * followed by symbol as the test plan follows it. Every plugin is
 * verified when the change reaches the harness itself (it imports the
 * loader and the core tools, so a change there reaches it) or a file the
 * analysis cannot follow, such as the root manifest or a tsconfig.
 */
import { affectedFiles } from '../ci/affected-specs.service';
import type { IAffectedSpecsInput } from '../ci/affected-specs.interface';

/** Every plugin must be verified. */
export const EVERY_PLUGIN = 'all';

/** Root files every plugin is built and resolved with. */
const READ_BY_EVERY_PLUGIN = /^(package\.json|bun\.lock|tsconfig[^/]*\.json)$/u;

const SPEC = /\.(spec|test)\.tsx?$/u;
const PLUGIN_FILE = /^plugins\/([^/]+)\//u;

/** The plugins `input.changed` can affect, or every one. Sorted. */
export const affectedPlugins = (
	input: IAffectedSpecsInput,
	harness: string,
): readonly string[] | typeof EVERY_PLUGIN => {
	if (input.changed.some((file) => READ_BY_EVERY_PLUGIN.test(file))) {
		return EVERY_PLUGIN;
	}
	const reached = affectedFiles(input);
	if (reached.includes(harness)) return EVERY_PLUGIN;
	const plugins = new Set<string>();
	// A plugin's manifest, skills and configuration are no module, so
	// the analysis does not reach them: a changed one counts by place.
	for (const file of [...reached, ...input.changed]) {
		const plugin = PLUGIN_FILE.exec(file)?.[1];
		if (plugin !== undefined && !SPEC.test(file)) plugins.add(plugin);
	}
	return [...plugins].sort();
};
