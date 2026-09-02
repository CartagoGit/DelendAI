import type { IManagedLazyDemotionNotice } from '../contracts/interfaces/managed-lazy-demotion.interface';
import { announceLines } from '../shared/announce-lines';

/**
 * Why the managed-lazy surface was declined, said out loud.
 *
 * The lazy route is all-or-nothing: `tryAssembleManagedLazy` needs an
 * entry in `managed-lazy-catalog.generated.ts` for EVERY effective
 * plugin, because the runtime routes tool calls through that index and
 * a plugin missing from it would own tools nobody could activate. So a
 * single unindexed plugin sends the whole surface back to eager
 * loading.
 *
 * That fallback is correct — degrading to eager keeps every tool
 * working — but it used to be completely silent, and the cost is paid
 * by everyone: every plugin module is imported at boot, and the whole
 * tool surface is registered up front instead of on demand. The usual
 * cause is mundane and fixable in one command: someone added a plugin
 * to a preset or to the config and did not regenerate the catalog.
 * Nothing pointed at that, so the regression could sit for weeks
 * looking like "the server just got slower".
 */
export type { IManagedLazyDemotionNotice };

/**
 * Build the notice for a demotion caused by unindexed plugins. Returns
 * no lines when every plugin is indexed (there is nothing to explain).
 */
export const buildManagedLazyDemotionNotice = (input: {
	readonly effectivePlugins: readonly string[];
	readonly isIndexed: (specifier: string) => boolean;
}): IManagedLazyDemotionNotice => {
	const unindexed = input.effectivePlugins.filter(
		(specifier) => !input.isIndexed(specifier),
	);
	if (unindexed.length === 0) return { lines: [], unindexed: [] };
	return {
		unindexed,
		lines: [
			`[mcp-vertex] lazy plugin loading is OFF: ${unindexed.join(', ')} ${unindexed.length === 1 ? 'is' : 'are'} not in the managed-lazy catalog, so the whole surface fell back to eager loading.`,
			'[mcp-vertex] Every tool still works; boot is slower and the full tool surface is registered up front. Fix with `bun tools/scripts/generate/managed-lazy-catalog.script.ts`.',
		],
	};
};

/** Write the notice. Never throws — see `announce-plugin-failures.ts`. */
export const announceManagedLazyDemotion = (
	notice: IManagedLazyDemotionNotice,
	write?: (line: string) => void,
): void => {
	announceLines(notice.lines, write);
};
