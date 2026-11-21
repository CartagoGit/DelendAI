/**
 * agent-host-name.helper.ts — which host a client or program name belongs
 * to, read from `AGENT_HOSTS` so no other table of client names exists.
 */
import { AGENT_HOSTS } from '../contracts/constants/agent-hosts.constant';

/** A name as a host or client reports it, compared lower-cased with spaces as hyphens. */
const nameKey = (name: string): string =>
	name.trim().toLowerCase().replace(/\s+/gu, '-');

/** Every name a host is known by: its id, label, identity name and the programs it reports. */
const hostByName: ReadonlyMap<string, string> = new Map(
	AGENT_HOSTS.flatMap((host) =>
		[
			host.id,
			host.label,
			host.identity?.name,
			...(host.identity?.applications ?? []),
		]
			.filter((name): name is string => name !== undefined)
			.map((name): [string, string] => [nameKey(name), host.id]),
	),
);

/** The id of the host a client or program name belongs to, or `undefined`. */
export const agentHostOfName = (name: string): string | undefined =>
	hostByName.get(nameKey(name));
