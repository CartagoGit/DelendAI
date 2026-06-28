/**
 * agent-identity.ts — f00082 S1.
 *
 * Pure helpers for the composite agent identity. Lives in the
 * proposals plugin (not the core) because the `nextCollisionSuffix`
 * helper needs to enumerate the existing branches for a given
 * prefix — a registry concern, not a core contract. The TYPE
 * (`IAgentIdentity`, `AgentHost`) lives in the core so the engine
 * can import it from one place (see
 * `packages/core/src/lib/contracts/interfaces/agent-identity.interface.ts`).
 *
 * ## Why pure
 *
 * Every function in this file is deterministic and side-effect-free:
 * no `process.cwd`, no `process.env`, no filesystem, no `Date.now`.
 * Tests pass a literal `existingBranches` set to drive the
 * collision logic; the production caller queries `git branch --list`
 * once and threads the result in.
 */

import {
	AGENT_IDENTITY_LIMITS,
	type AgentHost,
	type IAgentIdentity,
} from '@mcp-vertex/core/public';

/** Canonical slug table for the known hosts. The string is the
 * final branch-component (no prefix, no separators). */
const HOST_SLUGS: Readonly<Record<AgentHost, string>> = {
	'vscode-copilot': 'copilot',
	'claude-code': 'claude-code',
	'codex-cli': 'codex-cli',
	cursor: 'cursor',
	aider: 'aider',
	continue: 'continue',
	unknown: 'unknown',
};

/**
 * Normalise any string to a slug-safe form. Keeps `[a-z0-9-]`,
 * collapses everything else to `-`, trims leading/trailing dashes,
 * and falls back to `'unknown'` when the result is empty (so the
 * caller never has to special-case "model name was empty").
 */
export const slugify = (value: string): string => {
	const trimmed = value.trim().toLowerCase();
	const slug = trimmed
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug.length > 0 ? slug : 'unknown';
};

/** Cap a slug at the per-field limit (24 chars by default). */
const capSlug = (value: string): string =>
	value.length <= AGENT_IDENTITY_LIMITS.perField
		? value
		: value.slice(0, AGENT_IDENTITY_LIMITS.perField).replace(/-+$/u, '');

/** Slugify the host field through the canonical table. */
export const slugifyHost = (host: AgentHost | undefined): string => {
	if (host === undefined) return '';
	const slug = HOST_SLUGS[host];
	return capSlug(slug === 'unknown' ? '' : slug);
};

/** Slugify the model field (free-form, capped at 24 chars). */
export const slugifyModel = (model: string | undefined): string => {
	if (model === undefined) return '';
	return capSlug(slugify(model));
};

/** Slugify the task_id (proposal id like `f00078`, `x00076`, ...). */
export const slugifyTaskId = (taskId: string | undefined): string => {
	if (taskId === undefined) return '';
	return capSlug(slugify(taskId));
};

/** Slugify the agent_name. The agent_name is mandatory. */
export const slugifyAgentName = (agentName: string): string =>
	capSlug(slugify(agentName));

/**
 * Compose the composite branch slug. Returns just the four-field
 * composite (no `agent/` prefix — the engine adds that). The order
 * is `<host>-<model>-<agent_name>-<task_id>`, omitting any
 * field that is empty. The total length is bounded at
 * `AGENT_IDENTITY_LIMITS.composite` (92 chars) — when the natural
 * composite would exceed the cap, the suffix fields are
 * progressively truncated until it fits, with the agent_name
 * (always required) shrinking last.
 */
export const composeIdentity = (identity: IAgentIdentity): string => {
	const fields = [
		slugifyHost(identity.host),
		slugifyModel(identity.model),
		slugifyAgentName(identity.agent_name),
		slugifyTaskId(identity.task_id),
	].filter((f) => f.length > 0);

	// Without any of the new fields, this is the historical
	// single-arg shape — return just the agent_name so the
	// worktree engine keeps emitting `agent/<agent_name>`.
	if (fields.length === 1 && fields[0] === slugifyAgentName(identity.agent_name)) {
		return fields[0]!;
	}

	let composite = fields.join('-');
	if (composite.length <= AGENT_IDENTITY_LIMITS.composite) return composite;

	// Over the cap: progressively trim the rightmost (most
	// disambiguating) fields. We keep host + agent_name intact and
	// trim model first, then task_id.
	const host = slugifyHost(identity.host);
	const agent = slugifyAgentName(identity.agent_name);
	const model = slugifyModel(identity.model);
	const task = slugifyTaskId(identity.task_id);

	const tryCompose = (m: string, t: string): string => {
		const parts = [host, m, agent, t].filter((p) => p.length > 0);
		return parts.join('-');
	};

	// First drop the task_id, then trim the model.
	if (task.length > 0) {
		composite = tryCompose(model, '');
		if (composite.length <= AGENT_IDENTITY_LIMITS.composite) return composite;
	}
	if (model.length > 0) {
		const trimmedModel = capSlug(model).slice(0, 8);
		composite = tryCompose(trimmedModel, task);
		if (composite.length <= AGENT_IDENTITY_LIMITS.composite) return composite;
	}
	// Last resort: trim the agent_name (the required field). The
	// composite is then `<host>-<agent_short>-<task>` and stays
	// unique because host + task are still in there.
	const trimmedAgent = capSlug(agent).slice(0, 12);
	const parts = [host, trimmedAgent, task].filter((p) => p.length > 0);
	return parts.join('-');
};

/**
 * The inverse of `composeIdentity`. The parser is **lossy-friendly**:
 * unknown hosts / models pass through as `'unknown'` instead of
 * erroring, so a branch name from an older host can still be
 * parsed. Order is the canonical `<host>-<model>-<agent_name>-<task_id>`.
 */
export const parseIdentity = (
	slug: string,
): Pick<IAgentIdentity, 'host' | 'model' | 'agent_name' | 'task_id'> => {
	const parts = slug.split('-');
	// Heuristic: when 4 parts, assume the canonical order. When 3
	// or fewer, the parser is best-effort — we treat the first part
	// as the host (or 'unknown'), the last as the task_id (or
	// undefined), and the middle as the agent_name.
	if (parts.length === 4) {
		const [host, model, agent, task] = parts as [
			string,
			string,
			string,
			string,
		];
		return {
			host: reverseLookupHost(host),
			model,
			agent_name: agent,
			task_id: task,
		};
	}
	// Best-effort fallback for non-canonical shapes (e.g. legacy
	// `agent/<agent_name>` or the host-pair form
	// `agent/copilot-minimax-m3` the user picks manually).
	return {
		host: parts[0] !== undefined ? reverseLookupHost(parts[0]) : 'unknown',
		model: 'unknown',
		agent_name: slug,
	};
};

const reverseLookupHost = (slug: string): AgentHost => {
	for (const [host, canonical] of Object.entries(HOST_SLUGS) as Array<
		[AgentHost, string]
	>) {
		if (canonical === slug) return host;
	}
	return 'unknown';
};

/**
 * Pick the next numeric collision suffix for a composite that
 * already exists. Pure: takes a set of existing branches and
 * returns the smallest `n ≥ 1` such that `<composite>-<n>` is
 * not in the set. When the composite itself is free, returns
 * `null` (the caller uses the bare composite).
 *
 * Examples:
 *   nextCollisionSuffix({}, 'copilot-m3-orion-f00078')       → null
 *   nextCollisionSuffix({'copilot-m3-orion-f00078'}, '…')    → 1
 *   nextCollisionSuffix({…, '…-f00078-1'}, '…')              → 2
 *   nextCollisionSuffix({…, '…-f00078-1', '…-f00078-3'}, '…') → 2 (gap-fill)
 */
export const nextCollisionSuffix = (
	existingBranches: ReadonlySet<string>,
	composite: string,
): number | null => {
	if (!existingBranches.has(composite)) return null;
	const prefix = `${composite}-`;
	for (let n = 1; n < 1000; n += 1) {
		if (!existingBranches.has(`${prefix}${n}`)) return n;
	}
	// 1000 collisions on the same composite is the system's bug,
	// not the caller's. Return 1000 so the branch name remains
	// bounded and the caller can surface a clear error.
	return 1000;
};
