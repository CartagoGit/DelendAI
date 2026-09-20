/**
 * resolve-work-agent.ts — who a unit of work is named after, answered
 * once for the whole system.
 *
 * WHY this is in core and not where it was: the answer lived inside the
 * `commit-policy` plugin, so every other entry point invented its own.
 * The CLI read `DELENDAI_AGENT_ID` or an argument; the host built
 * `host@<config name>`; the plugin walked model → host → MCP client →
 * MACHINE. Three answers to "who am I", and the refs show it:
 * `delendai/wip/desktop-9ctqrs7/…` and `delendai/wip/visual-studio-code/…`
 * sit in this repository next to `delendai/wip/claude-opus-5/…`.
 *
 * WHY the machine is never an answer: the convention names the agent
 * that did the work, and a ref named after a computer tells a reader who
 * owns the hardware. With a swarm it is worse than useless — twenty
 * agents on one machine collapse into one name, and the refs stop being
 * attributable at all, which is the property the whole work model rests
 * on.
 *
 * WHY an unidentifiable agent gets a marker rather than a guess: a name
 * that says "nobody declared this" is a thing an operator can fix. A
 * hostname quietly standing in for a model is a thing nobody notices
 * until the graph is full of it.
 */

import { WORK_AGENT_UNKNOWN } from './resolve-work-agent.constant';
import type {
	IWorkAgentIdentity,
	IWorkAgentSources,
} from './resolve-work-agent.interface';

export { WORK_AGENT_UNKNOWN } from './resolve-work-agent.constant';
export type {
	IWorkAgentIdentity,
	IWorkAgentSource,
	IWorkAgentSources,
} from './resolve-work-agent.interface';

const read = (value: string | (() => string | undefined) | undefined) => {
	const resolved = typeof value === 'function' ? value() : value;
	return resolved !== undefined && resolved.trim().length > 0
		? resolved.trim()
		: undefined;
};

/**
 * Reduce a declared identity to the characters a git ref component and a
 * file name both accept, so the same identity names the ref, the
 * worktree and the row in the state.
 */
export const normalizeWorkAgentId = (value: string): string =>
	value
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9._-]+/gu, '-')
		.replaceAll(/-{2,}/gu, '-')
		.replace(/^[-._]+/u, '')
		.replace(/[-._]+$/u, '');

/**
 * The agent, in the order of how specific each source is about WHO did
 * the work: the exact model, then what the environment declares, then
 * the name the MCP client reported at the handshake. Never the machine.
 */
export const resolveWorkAgentId = (
	sources: IWorkAgentSources,
): IWorkAgentIdentity => {
	const model = read(sources.model);
	if (model !== undefined) {
		return { id: normalizeWorkAgentId(model), source: 'model' };
	}
	const declared = read(sources.environment);
	if (declared !== undefined) {
		return { id: normalizeWorkAgentId(declared), source: 'environment' };
	}
	const client = read(sources.client);
	if (client !== undefined) {
		return { id: normalizeWorkAgentId(client), source: 'client' };
	}
	return { id: WORK_AGENT_UNKNOWN, source: 'none' };
};
