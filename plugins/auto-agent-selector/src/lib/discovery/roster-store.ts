/**
 * roster-store.ts — durable, secret-safe snapshot of zero-config discovery.
 *
 * Discovery is deliberately live (PATH and environment can change between
 * calls), while this store gives users and host diagnostics a crash-safe
 * record of the last roster the plugin configured for itself. It stores only
 * provider metadata and environment-variable *names* — never key values.
 */
import {
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
} from '@delendai/core/public';

import type { IDiscoveredRoster } from '../contracts/interfaces/roster.interface';

const SCHEMA = 'mcp-vertex/auto-agent-selector/roster/1' as const;

/** Durable boundary for a discovered roster; injectable so tools stay pure. */
export interface IRosterSnapshotStore {
	save(roster: IDiscoveredRoster): Promise<void>;
}

/**
 * Persist the last discovered roster with the shared mutex + atomic-write
 * primitives. The redaction pass is defence in depth: discovery exposes only
 * env-var names, but durable state must remain safe if that shape evolves.
 */
export const realRosterSnapshotStore = (
	path: string,
	defaultCostQualityTradeoff: number = 7,
): IRosterSnapshotStore => ({
	save: async (roster) => {
		const text = `${JSON.stringify(
			{
				schema: SCHEMA,
				updatedAt: new Date().toISOString(),
				defaultCostQualityTradeoff,
				roster,
			},
			null,
			2,
		)}\n`;
		const redacted = redactSecrets(text).text;
		await withFileMutex(path, async () => {
			await writeFileAtomic(path, redacted);
		});
	},
});
