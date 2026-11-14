import type {
	IChangeFootprint,
	ILandCommandRunner,
	ILandConfig,
	ILandDeps,
	ILandForge,
	ILandGit,
} from '@delendai/core/cli';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

/** Runs git in `cwd` and returns its trimmed stdout; throws when git fails. */
export type IGitExec = (
	cwd: string,
	args: readonly string[],
	env?: NodeJS.ProcessEnv,
) => string;

/** Runs a project's own command line in `cwd`; whether it succeeded, and what it printed. */
export type IProjectCommandRunner = (
	cwd: string,
	commandLine: string,
) => { readonly ok: boolean; readonly stdout: string };

/** What a pass reads from the project; every port has a product default. */
export interface ILandProjectPorts {
	/** The paths a regeneration rebuilds: a conflict in them is not a decision. */
	readonly derivedPaths: ReadonlySet<string>;
	/** Rebuild the derived files in a batch tree; false when it failed. */
	readonly regenerate: (dir: string) => boolean;
	/** Run in a batch tree after its members merged; commits what it changed. */
	readonly normalizeBatch: (
		dir: string,
		commit: (subject: string) => void,
	) => void;
	/** What the change from `base` to `head` touches. */
	readonly footprintOf: (base: string, head: string) => IChangeFootprint;
	readonly sectionOfCheck: ILandConfig['sectionOfCheck'];
}

/** Everything one pass is composed from. */
export interface IIntegrationPassInput {
	/** The checkout the pass runs in. */
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	/** `GITHUB_REPOSITORY`, `GH_TOKEN`, `LAND_WATCHDOG`. */
	readonly env: Readonly<Record<string, string | undefined>>;
	/** The forge CLI (`gh`); only the real one spawns a process. */
	readonly runGh: ILandCommandRunner;
	readonly log: (line: string) => void;
	readonly error: (line: string) => void;
	/** Specs replace what would touch a real forge or clone. */
	readonly ports?: {
		readonly forge?: ILandForge;
		readonly git?: ILandGit;
		readonly bringForward?: ILandDeps['bringForward'];
		readonly gitExec?: IGitExec;
		readonly runProjectCommand?: IProjectCommandRunner;
	};
}
