/**
 * provider-model-bridge.ts — the model a chat provider served, read from
 * the file that provider publishes.
 *
 * A host application names itself at the MCP handshake (`Visual Studio
 * Code`), never the model behind it, and some providers — Universal Chat
 * Provider under Copilot Chat, which routes OAuth CLI accounts through a
 * local proxy — know the exact model of every request but have no API
 * channel to report it outward. The agent behind such a host could only
 * declare `DELENDAI_AGENT_ID` by hand or refuse to work at all, and an
 * invented id is worse than either.
 *
 * The bridge closes the gap honestly: the provider writes the model that
 * actually served each request to `~/.cache/delendai/provider-model.json`,
 * and this module reads it back — an OBSERVED model id, with the moment
 * it was observed attached. Nothing is guessed.
 *
 * WHY a freshness window at all: the file is shared machine-wide, so a
 * stale one would name a model that served a request hours ago — possibly
 * in another window, under another account. Chat requests are frequent
 * (every turn writes one) and delendai calls happen inside a turn, so
 * anything older than minutes was not written by the conversation now
 * working. Freshness turns a shared file into a statement about *this*
 * moment without coordinating the writers.
 *
 * WHY lazy: the resolver prefers an explicit `--agent` and
 * `DELENDAI_AGENT_ID`; the bridge must not touch the filesystem when
 * either already answered. It is consumed as a thunk, and
 * `resolveWorkAgentId` only calls the thunk of the source it reaches.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { IProviderModelReading } from '../contracts/interfaces/provider-model-reading.interface';
import type { IHostChatModel } from '../contracts/interfaces/host-chat-model.interface';
import { agentHostMarker } from './agent-environment.helper';
import { hostChatModel } from './host-chat-model.helper';
import { rememberSeenModel, seenModelsPath } from './model-identity.helper';
import {
	PROVIDER_MODEL_BRIDGE_FILE,
	PROVIDER_MODEL_BRIDGE_VARIABLE,
	PROVIDER_MODEL_MAX_AGE_MS,
} from './provider-model-bridge.constant';

export {
	PROVIDER_MODEL_BRIDGE_VARIABLE,
	PROVIDER_MODEL_MAX_AGE_MS,
} from './provider-model-bridge.constant';

/** The bridge's default file, under the user cache of the provider host. */
export const providerModelBridgePath = (
	env: NodeJS.ProcessEnv = process.env,
): string =>
	env[PROVIDER_MODEL_BRIDGE_VARIABLE]?.trim().length
		? env[PROVIDER_MODEL_BRIDGE_VARIABLE].trim()
		: join(homedir(), '.cache', 'delendai', PROVIDER_MODEL_BRIDGE_FILE);

/** What a provider writes: the model observed, with its observation. */
interface IProviderModelEntry {
	readonly model?: unknown;
	readonly at?: unknown;
	readonly provider?: unknown;
	readonly workspace?: unknown;
}

/**
 * What the bridge reads: the model, or why it names none. The reason is
 * what an identity refusal tells the person, instead of silence.
 */
const bridgeReading = (
	input: {
		readonly workspace?: string | undefined;
		readonly now?: Date | undefined;
		readonly env?: NodeJS.ProcessEnv | undefined;
	} = {},
): IProviderModelReading => {
	const env = input.env ?? process.env;
	const path = providerModelBridgePath(env);
	if (!existsSync(path)) return { reason: 'absent', path };
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		// A half-written file says nothing; the next request rewrites it.
		return { reason: 'malformed', path };
	}
	const candidates = entriesOf(parsed);
	if (candidates.length === 0) return { reason: 'malformed', path };
	const now = (input.now ?? new Date()).getTime();
	// A caller that names its workspace takes only what was recorded for
	// it: an entry recorded for no workspace said nothing about this one,
	// and taking it attributed another project's model to this one.
	const mine = candidates.filter((entry) =>
		input.workspace === undefined
			? true
			: typeof entry.workspace === 'string' &&
				entry.workspace.length > 0 &&
				sameConversationWorkspace(entry.workspace, input.workspace),
	);
	if (mine.length === 0) return { reason: 'other-workspace', path };
	const observed = mine
		.map((entry) => ({ entry, at: Date.parse(String(entry.at)) }))
		.filter(({ at }) => !Number.isNaN(at))
		.sort((left, right) => right.at - left.at);
	const freshest = observed[0];
	if (freshest === undefined) return { reason: 'malformed', path };
	const fresh = observed.filter(
		({ at }) => Math.abs(now - at) <= PROVIDER_MODEL_MAX_AGE_MS,
	);
	if (fresh.length === 0)
		return { reason: 'stale', path, ageMs: now - freshest.at };
	// Two conversations at work in this workspace, on different models:
	// nothing says which one is calling, and the latest is not it.
	const models = [
		...new Set(fresh.map(({ entry }) => String(entry.model).trim())),
	];
	if (models.length > 1) return { reason: 'ambiguous', path, models };
	const [latest] = fresh;
	return {
		model: models[0] ?? '',
		...(typeof latest?.entry.provider === 'string'
			? { provider: latest.entry.provider }
			: {}),
	};
};

/**
 * What the bridge reads, or, when no provider publishes, what the editor
 * itself recorded serving this workspace's last chat request. The editor
 * needs no cooperation from the extension that provides the model, so a
 * provider that never writes the bridge is still named.
 */
export const providerModelReading = (
	input: {
		readonly workspace?: string | undefined;
		readonly now?: Date | undefined;
		readonly env?: NodeJS.ProcessEnv | undefined;
	} = {},
): IProviderModelReading => {
	// The bridge and the editor's record both name the latest CHAT
	// conversation in a workspace. A process an agent host drives is not
	// that conversation: a Codex session beside a Copilot chat in the same
	// project read the chat's model and worked under it.
	const marker = agentHostMarker(input.env ?? process.env);
	if (marker !== undefined)
		return {
			reason: 'agent-host',
			path: providerModelBridgePath(input.env ?? process.env),
			marker,
		};
	const published = bridgeReading(input);
	if (
		'model' in published ||
		input.workspace === undefined ||
		published.reason === 'ambiguous'
	)
		return published;
	const seen = observedHostModel(input.workspace, input.now, input.env);
	if (seen === undefined) return published;
	rememberSeenModel(seen.model, seenModelsPath(input.env ?? process.env));
	return { model: seen.model, provider: `host:${seen.host}` };
};

/** One host reading per workspace for a few seconds: the editor's files are slow to walk. */
const HOST_READING_TTL_MS = 10_000;
const hostReadings = new Map<
	string,
	{ readonly at: number; readonly value: IHostChatModel | undefined }
>();
const observedHostModel = (
	workspace: string,
	now: Date | undefined,
	env: NodeJS.ProcessEnv | undefined,
): IHostChatModel | undefined => {
	if (now !== undefined || env !== undefined)
		return hostChatModel({ workspace, now, env });
	const cached = hostReadings.get(workspace);
	if (cached !== undefined && Date.now() - cached.at < HOST_READING_TTL_MS)
		return cached.value;
	const value = hostChatModel({ workspace });
	hostReadings.set(workspace, { at: Date.now(), value });
	return value;
};

/**
 * The model id the bridge currently reports, or `undefined` when the
 * file is absent, unreadable, malformed, stale, or — when `workspace` is
 * given — belongs to another workspace's conversation.
 */
export const providerModelId = (
	input: Parameters<typeof providerModelReading>[0] = {},
): string | undefined => {
	const reading = providerModelReading(input);
	return 'model' in reading ? reading.model : undefined;
};

/**
 * The entries a bridge file holds. One provider writes a single entry;
 * the per-workspace form keeps, under `entries`, one entry per workspace
 * or a list with one per conversation working in it,
 * so two windows on different workspaces no longer erase each other.
 */
const entriesOf = (parsed: unknown): readonly IProviderModelEntry[] => {
	if (typeof parsed !== 'object' || parsed === null) return [];
	const record = parsed as Record<string, unknown>;
	// Per workspace: one entry, or one per conversation in it.
	const raw =
		typeof record.entries === 'object' && record.entries !== null
			? Object.entries(record.entries as Record<string, unknown>).flatMap(
					([workspace, value]) =>
						(Array.isArray(value) ? value : [value]).map((entry) =>
							typeof entry === 'object' && entry !== null
								? {
										workspace,
										...(entry as IProviderModelEntry),
									}
								: undefined,
						),
				)
			: [record as IProviderModelEntry];
	return raw.filter(
		(entry): entry is IProviderModelEntry =>
			entry !== undefined &&
			typeof entry.model === 'string' &&
			entry.model.trim().length > 0 &&
			typeof entry.at === 'string',
	);
};

/** What to tell a person when the bridge named no model, and how to fix it. */
export const providerBridgeSilence = (
	reading: IProviderModelReading,
): string | undefined => {
	if ('model' in reading) return undefined;
	const why = {
		absent: `no chat provider publishes the model it serves (${reading.path} does not exist)`,
		malformed: `${reading.path} holds no readable model entry`,
		stale: `the last model a provider published is ${String(Math.round((reading.ageMs ?? 0) / 60_000))} min old, older than the ${String(PROVIDER_MODEL_MAX_AGE_MS / 60_000)} min that still say who is working now`,
		'other-workspace': `${reading.path} names the model of another workspace's conversation, not this one's`,
		ambiguous: `conversations in this workspace are working on different models (${(reading.models ?? []).join(', ')}) and nothing says which one is calling`,
		'agent-host': `this process runs under an agent host (${reading.marker ?? 'unknown'} is set), which knows its own model; ${reading.path} names a chat conversation's, which may be another agent's`,
	}[reading.reason];
	return `${why}. A provider that writes the bridge (docs/delendai/configuration/provider-model-bridge.md), ${PROVIDER_MODEL_BRIDGE_VARIABLE} pointing at where yours writes, or DELENDAI_AGENT_ID names it.`;
};

/**
 * Whether `workspace` belongs to the conversation that wrote `entry`:
 * the same folder, or nested inside it — a worktree under the
 * workspace's own cache is still the workspace's work. Anything else is
 * another window's conversation, and its model is not this one's.
 */
const sameConversationWorkspace = (entry: string, workspace: string): boolean =>
	entry === workspace ||
	workspace.startsWith(`${entry}/`) ||
	entry.startsWith(`${workspace}/`);
