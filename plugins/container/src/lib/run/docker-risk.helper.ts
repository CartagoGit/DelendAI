/**
 * docker-risk.helper.ts — what in a container's settings reaches beyond
 * the container.
 *
 * A privileged container, the docker socket mounted inside, a host folder
 * outside the workspace bound in, or the host's network, process or IPC
 * namespace each hands the container the host.
 * Such a run needs its own consent, `confirmRisk`, which `confirm` never
 * implies: a script that confirms every call still cannot do it by accident.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';

const SOCKET = /(?:^|:)\/(?:var\/)?run\/docker\.sock(?::|$)/u;

/**
 * True when a bind mount's host side lies outside `root`: an absolute
 * path elsewhere, `/` itself, or the home folder (`~`, `$HOME`). A name
 * with no path is a docker volume, not a host folder.
 */
const bindsOutside = (mount: string, root: string): boolean => {
	const source = mount.split(':')[0] ?? '';
	if (source.startsWith('~') || source.startsWith('$')) return true;
	if (!source.startsWith('/') && !source.startsWith('.')) return false;
	const rel = relative(root, resolve(root, source));
	return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
};

export const containerRisks = (
	settings: {
		readonly privileged?: boolean | undefined;
		readonly mounts?: readonly string[] | undefined;
		readonly network?: string | undefined;
		readonly pid?: string | undefined;
		readonly ipc?: string | undefined;
	},
	workspaceRootAbs: string,
): readonly string[] => [
	...(settings.privileged === true ? ['privileged'] : []),
	...(settings.mounts ?? [])
		.filter((mount) => SOCKET.test(mount))
		.map((mount) => `mounts the docker socket (${mount})`),
	...(settings.mounts ?? [])
		.filter(
			(mount) =>
				!SOCKET.test(mount) && bindsOutside(mount, workspaceRootAbs),
		)
		.map((mount) => `binds a host folder outside the workspace (${mount})`),
	...(['network', 'pid', 'ipc'] as const)
		.filter((namespace) => settings[namespace] === 'host')
		.map((namespace) => `shares the host's ${namespace} namespace`),
];
