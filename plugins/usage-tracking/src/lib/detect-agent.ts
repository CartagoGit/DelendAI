/**
 * detect-agent.ts — map an MCP `clientInfo.name` to a stable
 * {id, kind, extension} descriptor.
 *
 * The plugin NEVER sniffs `process.env` for vendor-specific variables
 * (wiki/02 §4). It maps the client name the host resolved (surfaced on
 * `ctx.hostIdentity.host`) through core's host catalog, with a user-supplied
 * `clientMap` override taking precedence so unknown clients can be named
 * without a code change.
 */
import { AGENT_HOSTS, agentHostOfName } from '@delendai/core/contracts';

import type { IAgentDescriptor } from './types';

/** A `{kind, extension}` mapping entry (table row or user override). */
export interface IClientMapping {
	readonly kind: string;
	readonly extension: string;
}

/**
 * delendai's own command-line clients. They are not agent hosts, so they
 * are named here; every host comes from core `AGENT_HOSTS`.
 */
const DELENDAI_CLIENTS: Readonly<Record<string, IClientMapping>> = {
	'cli-doctor': { kind: 'cli-doctor', extension: 'cli' },
	'cli-direct': { kind: 'cli-direct', extension: 'cli' },
};

/** The mapping of a host: its id, and the name an identity records it by. */
const hostMapping = (hostId: string): IClientMapping => {
	const host = AGENT_HOSTS.find((each) => each.id === hostId);
	return { kind: hostId, extension: host?.identity?.name ?? hostId };
};

/**
 * The built-in mapping of a client name: one of delendai's own clients,
 * or the host `AGENT_HOSTS` knows by that name (case and spacing aside).
 */
export const builtinClientMapping = (
	name: string,
): IClientMapping | undefined => {
	const own = DELENDAI_CLIENTS[name.trim().toLowerCase()];
	if (own !== undefined) return own;
	const host = agentHostOfName(name);
	return host === undefined ? undefined : hostMapping(host);
};

/**
 * The agent kind a record names, as hosts are named now: a record written
 * before kinds were host ids (`claude-code`) reads as its host (`claude`).
 */
export const agentKindOf = (kind: string): string =>
	DELENDAI_CLIENTS[kind] !== undefined
		? kind
		: (agentHostOfName(kind) ?? kind);

const UNKNOWN: IClientMapping = { kind: 'unknown', extension: 'unknown' };

/**
 * Resolve an agent descriptor from a raw client name. Resolution order:
 *   1. user `clientMap` (exact match, then case-insensitive),
 *   2. delendai's own clients, then the hosts core knows (case-insensitive),
 *   3. `unknown`.
 * The `id` preserves the raw client name so distinct instances stay
 * distinguishable in the log; it falls back to the detected kind, then
 * to `unknown`.
 */
export const detectAgent = (
	rawName: string | undefined,
	clientMap?: Readonly<Record<string, IClientMapping>>,
): IAgentDescriptor => {
	const raw = (rawName ?? '').trim();
	const key = raw.toLowerCase();

	const override =
		clientMap && (clientMap[raw] ?? clientMap[key] ?? undefined);
	const mapping = override ?? builtinClientMapping(raw) ?? UNKNOWN;

	return {
		id: raw !== '' ? raw : mapping.kind,
		kind: mapping.kind,
		extension: mapping.extension,
	};
};
