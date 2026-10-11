/**
 * declared-adoptions.service.ts — what the plugins declare they contribute to an
 * adoption, applied without loading them.
 *
 * The core used to write the GitHub issues hint itself, and the proposals
 * adapter wired `plugins.issues` when a repo was given: two places naming
 * a plugin neither of them is. A plugin now declares its contribution in
 * its manifest (`IPluginAdoption`), the first-party index carries it, and
 * this applies whatever is declared. Adoption usually runs before the
 * plugin is ever loaded, which is why it cannot contribute at run time
 * the way a loaded plugin's adoption extension does.
 */
import type { IDeclaredAdoptions } from '../contracts/interfaces/adopt-project.interface';
import type { IPluginRegistryEntry } from '../contracts/interfaces/plugin-registry.interface';

const fill = (
	text: string,
	values: { readonly value: string; readonly namespacePrefix: string },
): string =>
	text
		.replaceAll('{value}', values.value)
		.replaceAll('{namespacePrefix}', values.namespacePrefix);

/** Apply every declared adoption contribution to one request. */
export const declaredAdoptions = (
	entries: readonly IPluginRegistryEntry[],
	request: {
		readonly repo?: string;
		readonly namespacePrefix: string;
		readonly deferredPluginIds?: ReadonlySet<string>;
	},
): IDeclaredAdoptions => {
	const plugins: Record<string, { options: Record<string, string> }> = {};
	const rationale: string[] = [];
	const residual: string[] = [];
	let launchPreset: string | undefined;
	for (const entry of entries) {
		const adoption = entry.adoption;
		if (adoption === undefined) continue;
		const value = request[adoption.from];
		const deferred = request.deferredPluginIds?.has(entry.id) === true;
		if (deferred || value === undefined || value.trim().length === 0) {
			residual.push(
				fill(adoption.whenNotWired, {
					value: '',
					namespacePrefix: request.namespacePrefix,
				}),
			);
			continue;
		}
		const values = { value, namespacePrefix: request.namespacePrefix };
		plugins[entry.id] = {
			options: {
				...(plugins[entry.id]?.options ?? {}),
				[adoption.option]: value,
			},
		};
		rationale.push(fill(adoption.rationale, values));
		residual.push(fill(adoption.whenWired, values));
		launchPreset ??= adoption.launchPreset;
	}
	return { plugins, rationale, residual, launchPreset };
};
