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
 * The model id the bridge currently reports, or `undefined` when the
 * file is absent, unreadable, malformed, stale, or — when `workspace` is
 * given — belongs to another workspace's conversation.
 */
export const providerModelId = (
	input: {
		readonly workspace?: string | undefined;
		readonly now?: Date | undefined;
		readonly env?: NodeJS.ProcessEnv | undefined;
	} = {},
): string | undefined => {
	const env = input.env ?? process.env;
	const path = providerModelBridgePath(env);
	if (!existsSync(path)) return undefined;
	let entry: IProviderModelEntry;
	try {
		entry = JSON.parse(readFileSync(path, 'utf8')) as IProviderModelEntry;
	} catch {
		// A half-written file says nothing; the next request rewrites it.
		return undefined;
	}
	if (typeof entry.model !== 'string' || entry.model.trim().length === 0)
		return undefined;
	if (typeof entry.at !== 'string') return undefined;
	const observed = Date.parse(entry.at);
	const now = (input.now ?? new Date()).getTime();
	if (
		Number.isNaN(observed) ||
		observed > now + PROVIDER_MODEL_MAX_AGE_MS ||
		now - observed > PROVIDER_MODEL_MAX_AGE_MS
	)
		return undefined;
	if (
		input.workspace !== undefined &&
		typeof entry.workspace === 'string' &&
		entry.workspace.length > 0 &&
		!sameConversationWorkspace(entry.workspace, input.workspace)
	)
		return undefined;
	return entry.model.trim();
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
