/**
 * detect-agent.ts — map an MCP `clientInfo.name` to a stable
 * {id, kind, extension} descriptor.
 *
 * The plugin NEVER sniffs `process.env` for vendor-specific variables
 * (wiki/02 §4). It maps the client name the host resolved (surfaced on
 * `ctx.hostIdentity.host`) through a static table, with a user-supplied
 * `clientMap` override taking precedence so unknown clients can be named
 * without a code change.
 */
import type { IAgentDescriptor } from './types';

/** A `{kind, extension}` mapping entry (table row or user override). */
export interface IClientMapping {
	readonly kind: string;
	readonly extension: string;
}

/**
 * Built-in client table. Keyed by the lower-cased client name. Covers the
 * clients the proposal calls out (Copilot Chat, Claude Code, Codex CLI,
 * Cursor, Aider, Continue) plus the two headless CLI hosts (CRITICAL N6).
 */
export const BUILTIN_CLIENT_TABLE: Readonly<Record<string, IClientMapping>> = {
	'github copilot chat': { kind: 'copilot', extension: 'vscode-copilot' },
	copilot: { kind: 'copilot', extension: 'vscode-copilot' },
	'claude code': { kind: 'claude-code', extension: 'claude-code' },
	'claude-code': { kind: 'claude-code', extension: 'claude-code' },
	'codex cli': { kind: 'codex', extension: 'codex-cli' },
	codex: { kind: 'codex', extension: 'codex-cli' },
	cursor: { kind: 'cursor', extension: 'cursor' },
	aider: { kind: 'aider', extension: 'aider' },
	continue: { kind: 'continue', extension: 'continue' },
	'cli-doctor': { kind: 'cli-doctor', extension: 'cli' },
	'cli-direct': { kind: 'cli-direct', extension: 'cli' },
};

const UNKNOWN: IClientMapping = { kind: 'unknown', extension: 'unknown' };

/**
 * Resolve an agent descriptor from a raw client name. Resolution order:
 *   1. user `clientMap` (exact match, then case-insensitive),
 *   2. the built-in table (case-insensitive),
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
	const mapping = override ?? BUILTIN_CLIENT_TABLE[key] ?? UNKNOWN;

	return {
		id: raw !== '' ? raw : mapping.kind,
		kind: mapping.kind,
		extension: mapping.extension,
	};
};
