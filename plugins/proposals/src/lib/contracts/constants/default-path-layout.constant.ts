import type { IHostPathLayout } from '../interfaces/swarm-path-layout.interface';
import { joinRel } from '@mcp-vertex/core/public';

/**
 * Derive the full swarm path layout from a cache root and a docs root.
 * The mcp-vertex CLI resolves `--cacheDir` (default `.cache/mcp-vertex`)
 * and `--docsDir` (default `docs/mcp-vertex`) and hands the proposals
 * plugin those resolved roots. Cache artefacts (locks, queue,
 * checkpoints, worktrees) live under `cacheDir`; human-edited proposals
 * live under `docsDir`.
 */
export const buildSwarmPaths = (
	cacheDir: string,
	docsDir: string,
): IHostPathLayout => ({
	lockFile: joinRel(cacheDir, 'agents.lock.json'),
	agentRegistryFile: joinRel(cacheDir, 'subagent-registry.json'),
	roundContextDigestFile: joinRel(cacheDir, 'round-context.digest.json'),
	taskQueueDir: joinRel(cacheDir, 'agent-queue'),
	taskQueueFile: joinRel(cacheDir, 'agent-queue/queue.json'),
	taskQueueHeartbeatFile: joinRel(cacheDir, 'agent-queue/heartbeat.json'),
	closedTasksFile: joinRel(cacheDir, 'agent-queue/closed-tasks.json'),
	orchestratorCheckpointFile: joinRel(
		cacheDir,
		'agent/orchestrator/checkpoint.json',
	),
	orchestratorChatContextFile: joinRel(
		cacheDir,
		'agent/orchestrator/chat-context.json',
	),
	finishDayReportFile: joinRel(cacheDir, 'agent/finish-day/last-report.json'),
	finishDayJournalFile: joinRel(cacheDir, 'agent/finish-day/journal.log'),
	proposalsDir: joinRel(docsDir, 'proposals'),
	proposalIndexFile: joinRel(docsDir, 'proposals/index.json'),
	proposalIdCountersFile: joinRel(cacheDir, 'proposal-id-counters.json'),
	worktreesDir: joinRel(cacheDir, '.worktrees'),
	scratchDir: cacheDir,
});

/**
 * Default proposals layout, aligned with the mcp-vertex CLI defaults so the
 * fallback and the live server agree: cache/state under `.cache/mcp-vertex`,
 * human-edited proposals under `docs/mcp-vertex/proposals`. Everything the
 * project writes lives under the single `docs/mcp-vertex` root; override it
 * with `--docsDir` (and `--cacheDir`) — the proposals dir always follows as
 * `<docsDir>/proposals`. Every engine and tool shares this one layout, so
 * locks, queue, round-context and the proposal store agree on where state lives.
 */
export const DEFAULT_PATH_LAYOUT: IHostPathLayout = buildSwarmPaths(
	'.cache/mcp-vertex',
	'docs/mcp-vertex',
);
