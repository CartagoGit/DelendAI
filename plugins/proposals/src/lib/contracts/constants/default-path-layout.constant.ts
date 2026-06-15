import type { IHostPathLayout } from '../interfaces/swarm-path-layout.interface';
import { joinRel } from '@cartago-git/mcp-core/public';


/**
 * Derive the full swarm path layout from a cache root and a docs root.
 * The mcp-core CLI resolves `--cacheDir` (default `.cache/mcp-core`)
 * and `--docsDir` (default `docs/mcp-core`) and hands each plugin its
 * own namespaced sub-roots (`<cacheDir>/<plugin>`); the swarm plugin
 * passes those here. Cache artefacts (locks, queue, checkpoints) live
 * under `cacheDir`; human-edited proposals live under `docsDir`.
 */
export const buildSwarmPaths = (
	cacheDir: string,
	docsDir: string
): IHostPathLayout => ({
	lockFile: joinRel(cacheDir, 'agents.lock.json'),
	subagentRegistryFile: joinRel(cacheDir, 'subagent-registry.json'),
	roundContextDigestFile: joinRel(cacheDir, 'round-context.digest.json'),
	taskQueueDir: joinRel(cacheDir, 'agent-queue'),
	taskQueueFile: joinRel(cacheDir, 'agent-queue/queue.json'),
	taskQueueHeartbeatFile: joinRel(cacheDir, 'agent-queue/heartbeat.json'),
	closedTasksFile: joinRel(cacheDir, 'agent-queue/closed-tasks.json'),
	orchestratorCheckpointFile: joinRel(
		cacheDir,
		'agent/orchestrator/checkpoint.json'
	),
	orchestratorChatContextFile: joinRel(
		cacheDir,
		'agent/orchestrator/chat-context.json'
	),
	finishDayReportFile: joinRel(cacheDir, 'agent/finish-day/last-report.json'),
	finishDayJournalFile: joinRel(cacheDir, 'agent/finish-day/journal.log'),
	proposalsDir: joinRel(docsDir, 'proposals'),
	proposalIndexFile: joinRel(docsDir, 'proposals/index.json'),
	scratchDir: cacheDir,
});

/**
 * Default proposals layout: cache/state under `.cache`, human-edited
 * proposals under `docs/proposals` — the conventional layout. Every
 * engine in this package and the plugin's tools share this single
 * layout, so locks, queue, round-context and the proposal store always
 * agree on where state lives. Pass different roots to `buildSwarmPaths`
 * for a custom layout (programmatic use / relocating the store).
 */
export const DEFAULT_PATH_LAYOUT: IHostPathLayout = buildSwarmPaths(
	'.cache',
	'docs'
);
