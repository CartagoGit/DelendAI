/**
 * config-merge-edits.ts — f00502 S4.
 *
 * Merging generated defaults into a config a user already wrote, WITHOUT
 * losing what they wrote around it.
 *
 * `init` used to merge by rebuilding the object and re-serialising it. That
 * is correct about values and destructive about everything else: every
 * comment the user put in their config — the reason a plugin is off, the
 * note next to a threshold — vanished the moment a new plugin was added to
 * the catalogue. A configuration format that admits comments and then eats
 * them on the next upgrade is worse than one that never admitted them,
 * because the user only finds out after they have written something worth
 * keeping.
 *
 * So the merge is expressed as a list of edits against the existing TEXT.
 * Everything the user already has stays byte-for-byte where it was —
 * comments, key order, spacing, trailing commas — and only the genuinely
 * missing members are inserted.
 *
 * The rules below mirror `mergeDerivedConfig` exactly, at the same
 * granularity: the project's value always wins, a plugin entry merges one
 * level deep, and its `options` one level deeper. That correspondence is not
 * a claim in a comment — the spec asserts that applying these edits produces
 * the same object `mergeDerivedConfig` would have produced.
 */
import type { IJsoncEdit } from '@delendai/core/public';

type IRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is IRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Comments to attach to newly created members, keyed by the dotted path of
 * the member (`plugins.git`). Only consulted when the member is being
 * created, so running `init` twice never stacks a second copy.
 */
export type IMemberComments = ReadonlyMap<string, readonly string[]>;

const commentFor = (
	comments: IMemberComments | undefined,
	path: readonly string[],
): readonly string[] | undefined => comments?.get(path.join('.'));

const addEdit = (
	edits: IJsoncEdit[],
	path: readonly string[],
	value: unknown,
	comments: IMemberComments | undefined,
): void => {
	const leadingComment = commentFor(comments, path);
	edits.push(
		leadingComment === undefined
			? { path, value }
			: { path, value, leadingComment },
	);
};

/**
 * The edits that fill the gaps in `existing` from `recommended`, and nothing
 * else. An empty result means the user's config already says everything the
 * generated one would have said, and the file must not be rewritten at all.
 */
export const planConfigMergeEdits = (
	recommended: Readonly<IRecord>,
	existing: Readonly<IRecord>,
	comments?: IMemberComments,
): readonly IJsoncEdit[] => {
	const edits: IJsoncEdit[] = [];

	for (const [key, value] of Object.entries(recommended)) {
		if (key === 'plugins') continue;
		// The project's preference wins whenever it has one, so a key that
		// is already present is left exactly as the user wrote it.
		if (key in existing) continue;
		addEdit(edits, [key], value, comments);
	}

	const recommendedPlugins = recommended.plugins;
	if (!isRecord(recommendedPlugins)) return edits;

	const existingPlugins = existing.plugins;
	if (!isRecord(existingPlugins)) {
		// No `plugins` object at all (or one the user made something other
		// than an object, which is their business): write the whole block
		// in one edit rather than key by key.
		if (!('plugins' in existing)) {
			addEdit(edits, ['plugins'], recommendedPlugins, comments);
		}
		return edits;
	}

	for (const [pluginId, recommendedEntry] of Object.entries(
		recommendedPlugins,
	)) {
		const existingEntry = existingPlugins[pluginId];
		if (!(pluginId in existingPlugins)) {
			// A plugin the catalogue gained since the user's config was
			// written. This is the case that carries the generated comment.
			addEdit(edits, ['plugins', pluginId], recommendedEntry, comments);
			continue;
		}
		// `mergePluginEntry` only merges when BOTH sides are objects;
		// otherwise the project's value stands untouched.
		if (!isRecord(recommendedEntry) || !isRecord(existingEntry)) continue;

		for (const [key, value] of Object.entries(recommendedEntry)) {
			if (key === 'options') continue;
			if (key in existingEntry) continue;
			addEdit(edits, ['plugins', pluginId, key], value, comments);
		}

		const recommendedOptions = recommendedEntry.options;
		const existingOptions = existingEntry.options;
		if (!isRecord(recommendedOptions)) continue;
		if (!isRecord(existingOptions)) {
			if (!('options' in existingEntry)) {
				addEdit(
					edits,
					['plugins', pluginId, 'options'],
					recommendedOptions,
					comments,
				);
			}
			continue;
		}
		for (const [key, value] of Object.entries(recommendedOptions)) {
			if (key in existingOptions) continue;
			addEdit(
				edits,
				['plugins', pluginId, 'options', key],
				value,
				comments,
			);
		}
	}

	return edits;
};
