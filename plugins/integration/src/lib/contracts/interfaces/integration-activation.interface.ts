import type { IDoctorReport } from './integration-doctor.interface';
import type {
	IRehearsalKnownRed,
	IRehearsalReport,
} from './rehearsal.interface';

/** The two rehearsal modes whose reports activation needs. */
export type IActivationMode = 'fast' | 'real';

/** A workflow file the engine switch decides: written with `content`, or removed when `content` is absent. */
export interface IActivationFile {
	readonly path: string;
	readonly content: string | undefined;
}

/** Everything activation touches, so a spec gives it answers instead of a forge and a disk. */
export interface IActivationPorts {
	/** The integration branch's tip on the forge. */
	readonly tipOf: () => Promise<string>;
	/** The report of the latest completed run of that commit in `mode`, or none. */
	readonly reportOf: (
		mode: IActivationMode,
		tip: string,
	) => Promise<IRehearsalReport | undefined>;
	readonly knownRed: readonly IRehearsalKnownRed[];
	/** The ids a run with every scenario plays in each mode, from the catalogue the rehearse command draws on. */
	readonly scenarioIds: Readonly<Record<IActivationMode, readonly string[]>>;
	readonly doctor: () => Promise<IDoctorReport>;
	readonly readConfig: () => Promise<string>;
	readonly writeConfig: (text: string) => Promise<void>;
	/** The workflow files the given config text implies. */
	readonly renderWorkflows: (
		configText: string,
	) => Promise<readonly IActivationFile[]>;
	/** A workflow file's current content, or undefined when it is absent. */
	readonly readWorkflow: (path: string) => Promise<string | undefined>;
	readonly writeWorkflow: (path: string, content: string) => Promise<void>;
	readonly removeWorkflow: (path: string) => Promise<void>;
}

export interface IActivationResult {
	readonly engine: 'land' | 'none';
	/** Why activation was refused; empty when it was not. */
	readonly refusals: readonly string[];
	/** The files written or removed, by path. */
	readonly changed: readonly string[];
}
