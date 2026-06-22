/**
 * `HealthService` — client-side aggregator for the Health panel
 * (S4 in f126). Calls `proposals_state_health`,
 * `proposals_proposal_stale_list` and `proposals_agent_names` and
 * flattens them into a single `IHealthSnapshot` that the panel
 * renders without further processing.
 *
 * All calls are best-effort: a missing tool degrades to `[]` /
 * `0` instead of failing the whole snapshot.
 */
import type { McpStdioClient } from '../transport/mcp-stdio-client';
import type {
	IHealthOptions,
	IHealthSnapshot,
	IStaleAgent,
} from '../contracts/interfaces/health.interface';

const TOOL_STATE_HEALTH = 'proposals_state_health';
const TOOL_STALE_LIST = 'proposals_proposal_stale_list';
const TOOL_AGENT_NAMES = 'proposals_agent_names';

export class HealthService {
	constructor(private readonly client: McpStdioClient) {}

	async snapshot(options: IHealthOptions = {}): Promise<IHealthSnapshot> {
		const includeStaleList = options.includeStaleList ?? true;
		const [stateHealth, staleList, agentNames] = await Promise.all([
			this.callSafe(TOOL_STATE_HEALTH, {}),
			includeStaleList
				? this.callSafe(TOOL_STALE_LIST, {})
				: Promise.resolve(null),
			this.callSafe(TOOL_AGENT_NAMES, {}),
		]);

		const stale: IStaleAgent[] = [];
		if (
			staleList !== null &&
			(staleList as { ok?: boolean }).ok === true &&
			Array.isArray((staleList as { zombies?: unknown[] }).zombies)
		) {
			for (const z of (staleList as { zombies: readonly IStaleAgent[] })
				.zombies) {
				stale.push(z);
			}
		}

		const agents: string[] = [];
		if (Array.isArray((agentNames as { agents?: unknown[] })?.agents)) {
			for (const a of (
				agentNames as { agents: readonly { name: string }[] }
			).agents) {
				agents.push(a.name);
			}
		}

		const sh = stateHealth as {
			healthy?: boolean;
			locks?: { active?: number };
			queue?: {
				queueLength?: number;
				queuedCount?: number;
				waiterOrphans?: number;
				oldestAgeMinutes?: number;
				threshold?: string;
			} | null;
			registry?: { orphans?: number; threshold?: string };
		} | null;

		return {
			healthy: sh?.healthy === true,
			locksActive: sh?.locks?.active ?? 0,
			queue:
				sh?.queue === undefined || sh.queue === null
					? null
					: {
							length: sh.queue.queueLength ?? 0,
							queued: sh.queue.queuedCount ?? 0,
							orphans: sh.queue.waiterOrphans ?? 0,
							oldestAgeMinutes: sh.queue.oldestAgeMinutes ?? 0,
							threshold: sh.queue.threshold ?? 'unknown',
						},
			orphans: sh?.registry?.orphans ?? 0,
			orphansThreshold: sh?.registry?.threshold ?? 'unknown',
			stale,
			staleCount: stale.length,
			agents,
			fetchedAt: new Date().toISOString(),
		};
	}

	private async callSafe(tool: string, args: object): Promise<unknown> {
		try {
			return await this.client.request(tool, args);
		} catch {
			return null;
		}
	}
}
