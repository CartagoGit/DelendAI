/**
 * docker-risk.helper.ts — what in a container's settings reaches beyond
 * the container.
 *
 * A privileged container, the docker socket mounted inside, or the host's
 * network, process or IPC namespace each hands the container the host.
 * Such a run needs its own consent, `confirmRisk`, which `confirm` never
 * implies: a script that confirms every call still cannot do it by accident.
 */

const SOCKET = /(?:^|:)\/(?:var\/)?run\/docker\.sock(?::|$)/u;

export const containerRisks = (settings: {
	readonly privileged?: boolean | undefined;
	readonly mounts?: readonly string[] | undefined;
	readonly network?: string | undefined;
	readonly pid?: string | undefined;
	readonly ipc?: string | undefined;
}): readonly string[] => [
	...(settings.privileged === true ? ['privileged'] : []),
	...(settings.mounts ?? [])
		.filter((mount) => SOCKET.test(mount))
		.map((mount) => `mounts the docker socket (${mount})`),
	...(['network', 'pid', 'ipc'] as const)
		.filter((namespace) => settings[namespace] === 'host')
		.map((namespace) => `shares the host's ${namespace} namespace`),
];
