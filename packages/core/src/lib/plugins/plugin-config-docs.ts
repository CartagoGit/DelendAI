/**
 * plugin-config-docs.ts — f00502 S3: the text `delendai init` writes
 * above a plugin's entry in `delendai.config.json`.
 *
 * The point of the commented config is that the file teaches the user
 * what exists, what is on and where the options live, without sending
 * them to look anything up. The point of THIS module is that the text
 * has one home: it is derived from the plugin manifest and the
 * conventional documentation path, so 56 manifests do not have to
 * repeat a summary they already declare. `configDocs` on the manifest
 * only overrides a derived value when a plugin genuinely needs
 * different wording or a different page.
 *
 * Pure: same manifest, same lines. No I/O.
 */
import type { IPluginManifest } from '../contracts/interfaces/plugin-manifest.interface';

/** Where a plugin's generated documentation page lives by convention. */
export const conventionalPluginDocsPath = (pluginId: string): string =>
	`docs/delendai/plugins/auto-generated/${pluginId}.md`;

export interface IResolvedPluginConfigDocs {
	readonly summary: string;
	readonly docs: string;
}

/**
 * The effective documentation for one plugin's config entry: the
 * manifest's own summary and its conventional page, unless the
 * manifest overrides either.
 */
export const resolvePluginConfigDocs = (
	manifest: Pick<IPluginManifest, 'id' | 'summary' | 'configDocs'>,
): IResolvedPluginConfigDocs => ({
	summary: manifest.configDocs?.summary ?? manifest.summary,
	docs: manifest.configDocs?.docs ?? conventionalPluginDocsPath(manifest.id),
});

/**
 * The comment lines written above the entry. `enabled` is the preset's
 * decision, passed in rather than read from the manifest, and it is
 * stated in the comment so a disabled plugin explains its own absence
 * instead of looking broken.
 */
export const renderPluginConfigComment = (
	manifest: Pick<IPluginManifest, 'id' | 'summary' | 'configDocs'>,
	options: { readonly enabled: boolean; readonly presetName?: string },
): readonly string[] => {
	const { summary, docs } = resolvePluginConfigDocs(manifest);
	// English, because the summary it sits next to comes from the plugin
	// manifest and every manifest summary is English. Mixing languages
	// inside one comment block reads as a bug, not as localisation.
	const availability = options.enabled
		? undefined
		: options.presetName === undefined
			? 'Available, but not enabled.'
			: `Available, but not enabled by the ${options.presetName} preset.`;
	return [
		summary,
		...(availability === undefined ? [] : [availability]),
		`Options: ${docs}`,
	];
};
