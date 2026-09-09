/**
 * environment-seam.ts — the real `IStartupEnvironmentSeam`.
 *
 * WHY the repository key is read from the remote and never guessed: the
 * whole work model is keyed on `(forge, owner, name)`. A fallback that
 * invented one from the directory name would silently create a SECOND
 * identity for the same project, split the state in two, and be
 * impossible to notice until two machines disagreed about which work
 * exists. So an unparseable or absent remote comes back as `undefined`,
 * and the reconciler's environment phase turns that into a blocker with
 * a name instead of a guess.
 *
 * WHY `machineId` is derived rather than persisted: a file that stores
 * the identity of the machine can be copied along with a workspace (an
 * image, a `cp -a`, a restored backup), which is precisely how two hosts
 * end up claiming the same machine. Hashing the host's own stable facts
 * cannot be copied by accident, and needs no write at boot.
 *
 * Nothing here throws: git may be missing, the remote may be a local
 * path, `hostname()` may fail on a stripped container. Every one of those
 * degrades to a value the report can name.
 */

import { createHash } from 'node:crypto';
import { arch, hostname, platform } from 'node:os';

import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import type {
	IStartupEnvironment,
	IStartupEnvironmentSeam,
	IStartupRepositoryKey,
} from '../startup-reconciler/index';

/**
 * Hosts whose forge identity has a canonical short name. Anything else
 * keeps its hostname, which is still stable and still unique — a made-up
 * short name would only collide with a future one.
 */
const FORGE_BY_HOST: Readonly<Record<string, string>> = {
	'github.com': 'github',
	'www.github.com': 'github',
	'gitlab.com': 'gitlab',
	'bitbucket.org': 'bitbucket',
};

const forgeOf = (host: string): string =>
	FORGE_BY_HOST[host.toLowerCase()] ?? host.toLowerCase();

const stripSuffix = (name: string): string =>
	name.endsWith('.git') ? name.slice(0, -'.git'.length) : name;

const SCP_REMOTE = /^(?:[^@/]+@)?([^:/]+):(.+?)\/([^/]+?)\/?$/;
const URL_REMOTE =
	/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^:/]+)(?::\d+)?\/(.+?)\/([^/]+?)\/?$/;

/**
 * Parse the remote URL shapes git actually produces. Returns `undefined`
 * for anything else — including a filesystem path, which is a real remote
 * but carries no forge identity.
 */
export const parseRepositoryKey = (
	remoteUrl: string,
): IStartupRepositoryKey | undefined => {
	const url = remoteUrl.trim();
	if (url.length === 0) return undefined;
	const match = url.includes('://')
		? URL_REMOTE.exec(url)
		: SCP_REMOTE.exec(url);
	if (match === null) return undefined;
	const [, host, owner, name] = match;
	if (host === undefined || owner === undefined || name === undefined) {
		return undefined;
	}
	const repository = stripSuffix(name);
	if (owner.length === 0 || repository.length === 0) return undefined;
	return { forge: forgeOf(host), owner, name: repository };
};

/** Stable per-machine id. Derived, never written, never copied. */
export const deriveMachineId = (facts: {
	readonly hostname: string;
	readonly platform: string;
	readonly arch: string;
}): string =>
	createHash('sha256')
		.update(`${facts.hostname} ${facts.platform} ${facts.arch}`)
		.digest('hex')
		.slice(0, 16);

/** Host facts the machine id is derived from. Injectable for specs. */
export interface IStartupHostFacts {
	readonly hostname: string;
	readonly platform: string;
	readonly arch: string;
}

export interface IStartupEnvironmentSeamOptions {
	readonly workspaceRoot: string;
	readonly git: IGitRunner;
	/**
	 * The identity this process reconciles as. Injected because core is
	 * agnostic about who the agent is; the host resolves it.
	 */
	readonly agentId: string;
	/** Overridable so a spec can produce a deterministic environment. */
	readonly hostFacts?: IStartupHostFacts | undefined;
}

const readRemoteUrl = async (git: IGitRunner): Promise<string | undefined> => {
	const named = await git(['remote']);
	if (!named.ok) return undefined;
	const first = named.output
		.split('\n')
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (first === undefined) return undefined;
	const url = await git(['remote', 'get-url', first]);
	return url.ok ? url.output.trim() : undefined;
};

/** Bind the seam to one workspace and one git runner. */
export const createStartupEnvironmentSeam = (
	options: IStartupEnvironmentSeamOptions,
): IStartupEnvironmentSeam => ({
	detect: async (): Promise<IStartupEnvironment> => {
		const facts: IStartupHostFacts = options.hostFacts ?? {
			hostname: hostname(),
			platform: platform(),
			arch: arch(),
		};
		const remoteUrl = await readRemoteUrl(options.git);
		const repository =
			remoteUrl === undefined ? undefined : parseRepositoryKey(remoteUrl);
		return {
			workspaceRoot: options.workspaceRoot,
			machineId: deriveMachineId(facts),
			hostname: facts.hostname,
			platform: facts.platform,
			agentId: options.agentId,
			...(repository === undefined ? {} : { repository }),
		};
	},
});
