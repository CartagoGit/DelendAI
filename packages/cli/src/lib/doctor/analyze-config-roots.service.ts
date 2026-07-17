/**
 * analyze-config-roots.service.ts — a00064: config-vs-reality preflight
 * for `mcpv doctor`.
 *
 * Cross-checks every `plugins.<id>.options.roots` array in
 * `mcp-vertex.config.json` against the actual workspace tree — the
 * exact misconfiguration (roots describing a different project's
 * layout) that silently starved search/docs/conventions of files and
 * sent an adopter agent into the a00063 retry meltdown. Pure over the
 * parsed config and an injected `dirExists` probe, so it is fully
 * testable without a real filesystem.
 *
 * Lives in `lib/` (not the command group) so the doctor group file
 * keeps the `name: '<command>'` literal as its first name-shaped line —
 * the `cli-shape` lint derives each group's command name from exactly
 * that convention.
 */

export type DoctorSectionStatus = 'ok' | 'warn' | 'error';

export interface IDoctorSection {
	readonly name: string;
	readonly status: DoctorSectionStatus;
	readonly findings: readonly string[];
}

export const analyzeConfigRoots = (
	config: unknown,
	dirExists: (workspaceRel: string) => boolean,
): IDoctorSection => {
	const findings: string[] = [];
	const plugins =
		typeof config === 'object' && config !== null && 'plugins' in config
			? (config as { plugins?: unknown }).plugins
			: undefined;
	if (typeof plugins === 'object' && plugins !== null) {
		for (const [pluginId, entry] of Object.entries(
			plugins as Record<string, unknown>,
		)) {
			const options =
				typeof entry === 'object' &&
				entry !== null &&
				'options' in entry
					? (entry as { options?: unknown }).options
					: undefined;
			const roots =
				typeof options === 'object' &&
				options !== null &&
				'roots' in options
					? (options as { roots?: unknown }).roots
					: undefined;
			if (!Array.isArray(roots)) continue;
			const missing = roots.filter(
				(root): root is string =>
					typeof root === 'string' &&
					root.length > 0 &&
					!dirExists(root),
			);
			if (missing.length > 0) {
				findings.push(
					`plugins.${pluginId}.options.roots: ${missing.join(', ')} do not exist in this workspace — the plugin will scan 0 files`,
				);
			}
		}
	}
	if (findings.length === 0) {
		return {
			name: 'config',
			status: 'ok',
			findings: ['configured roots match the workspace layout'],
		};
	}
	return { name: 'config', status: 'warn', findings };
};
