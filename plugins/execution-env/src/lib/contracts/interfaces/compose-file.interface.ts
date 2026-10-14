/** The resource ceilings a compose service declares for itself. */
export interface IComposeLimits {
	readonly memoryBytes?: number;
	readonly cpus?: number;
}

/** The parts of one compose service this plugin reads. */
export interface IComposeService {
	readonly name: string;
	readonly image?: string;
	readonly workingDir?: string;
	readonly environment: Readonly<Record<string, string>>;
	/** Published ports as written in the file. */
	readonly ports: readonly string[];
	/** Volumes and bind mounts as written in the file. */
	readonly volumes: readonly string[];
	readonly limits: IComposeLimits;
}

/** The basic shape of a compose file: its services by name. */
export interface IComposeFile {
	readonly services: Readonly<Record<string, IComposeService>>;
}
