/**
 * docker-command.interface.ts — one docker command as a tool runs it, and
 * a compose file's services as the tools read them.
 */
import type { IArgvExec, IProbeDeps } from '@delendai/core/contracts';

/** How a tool reaches docker; injectable so specs never run it. */
export interface IDockerDeps {
	readonly probeDeps?: IProbeDeps | undefined;
	readonly runExec?: IArgvExec | undefined;
	/** Where compose files are resolved: the workspace root. */
	readonly cwd?: string | undefined;
}

/** A docker command and how much consent it needs. */
export interface IDockerCommand {
	/** The arguments after `docker`. */
	readonly argv: readonly string[];
	/** Changes something: an image, a container, a network, a volume. */
	readonly mutating: boolean;
	/** Why the command reaches beyond its container (privileged, the docker socket, the host's namespaces). */
	readonly risks: readonly string[];
}

/** What the caller passed to consent. */
export interface IDockerConsent {
	readonly confirm?: boolean | undefined;
	/** Consent for a command whose risks are listed; never implied by `confirm`. */
	readonly confirmRisk?: boolean | undefined;
	readonly dryRun?: boolean | undefined;
}

/** One service of a compose file, as far as the tools need it. */
export interface IComposeService {
	readonly name: string;
	readonly image?: string;
	readonly build?: string;
	readonly ports: readonly string[];
	/** Variable names only: values may be secrets. */
	readonly environment: readonly string[];
	readonly mounts: readonly string[];
}
