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
 *
 * WHY THE CLIENT NAME IS MARKED. The machine was removed and the MCP
 * client was kept, so the symptom this module cites in its own opening —
 * `delendai/wip/visual-studio-code/…` — came straight back, and
 * `delendai/wip/claude-code/…` is in the graph today. `claude-code` is an
 * application, not an agent: it answers "which program connected", never
 * "who did the work", and a reader seeing it beside
 * `delendai/wip/claude-opus-5/…` cannot tell that one of the two is not a
 * model.
 *
 * Dropping the source outright would lose real attribution, so it is
 * KEPT AND LABELLED: an identity that came from the handshake is
 * `client-<name>`. Nothing is lost, the graph stops lying, and "no model
 * was declared here" becomes visible at a glance — which is the same
 * argument the marker above rests on.
 */

import {
	CLIENT_ID_PREFIX,
	WORK_AGENT_UNKNOWN,
} from './resolve-work-agent.constant';
import type {
	IWorkAgentIdentity,
	IWorkAgentSources,
} from './resolve-work-agent.interface';

export {
	CLIENT_ID_PREFIX,
	WORK_AGENT_UNKNOWN,
} from './resolve-work-agent.constant';
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
	// Each source is judged AFTER normalising, not before.
	//
	// `read` only rejects an empty or blank string, so a source of `!!!`
	// passed as present and then normalised to `''` — an identity that is
	// no identity, reported as valid, and worse: it SHADOWED the next
	// source, so a host offering `!!!` as its model hid a perfectly good
	// `environment` behind it. The ref built from it would have been
	// `…/wip//x1-S1-g1/t`, which is not a ref at all.
	//
	// A source that cannot survive normalisation has not answered, so the
	// next one is asked.
	for (const [value, source] of [
		[sources.model, 'model'],
		[sources.environment, 'environment'],
		[sources.client, 'client'],
	] as const) {
		const raw = read(value);
		if (raw === undefined) continue;
		const id = normalizeWorkAgentId(raw);
		if (id.length === 0) continue;
		return {
			id: source === 'client' ? `${CLIENT_ID_PREFIX}${id}` : id,
			source,
		};
	}
	return { id: WORK_AGENT_UNKNOWN, source: 'none' };
};
