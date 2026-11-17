import type {
	DoctorSectionStatus,
	IDoctorSection,
} from '../../lib/doctor/types';
import type { IDoctorScore } from '../../lib/doctor/score';

/** The execution modes `doctor` was asked for. */
export interface IDoctorModes {
	/** Pipeline-oriented report: no human recap, documented exit codes. */
	readonly ci: boolean;
	/** Skip every check that needs the network, and say so. */
	readonly offline: boolean;
	/** Also run the slower checks registered as deep checks. */
	readonly deep: boolean;
}

/** One check that only runs under `--deep`. */
export interface IDeepCheck {
	readonly id: string;
	/** True when the check cannot run without the network. */
	readonly requiresNetwork: boolean;
	readonly run: (options: IDeepCheckOptions) => Promise<IDoctorSection>;
}

export interface IDeepCheckOptions {
	/** When true the check must not touch the network. */
	readonly offline: boolean;
}

/** One check the self-test reports, as the doctor needs to read it. */
export interface IErrorReportingSelfTestCheck {
	readonly id: string;
	readonly ok: boolean;
	readonly detail?: string | undefined;
	readonly skipped?: boolean | undefined;
}

export interface IErrorReportingSelfTestResult {
	readonly ok: boolean;
	readonly checks: readonly IErrorReportingSelfTestCheck[];
}

export interface IErrorReportingSelfTestInput {
	readonly reportObservedFailure: (
		toolName: string,
		result: unknown,
		error: unknown,
	) => Promise<void>;
	readonly probeDirAbs: string;
	readonly targetRepo: string;
	readonly live?: boolean;
	readonly exec?: unknown;
}

/** The self-test entry point, injectable so a spec can fake `gh`. */
export type IErrorReportingSelfTestRunner = (
	input: IErrorReportingSelfTestInput,
) => Promise<IErrorReportingSelfTestResult>;

/** Resolves the runner, or `undefined` when the plugin is not available. */
export type IErrorReportingSelfTestLoader = () => Promise<
	IErrorReportingSelfTestRunner | undefined
>;

/** The block `--ci` adds to the report. */
export interface IDoctorCiReport {
	readonly exitCode: number;
	readonly meaning: string;
	/** Names of the sections that are not healthy. */
	readonly failing: readonly string[];
	/** Names of the sections that were skipped. */
	readonly skipped: readonly string[];
}

export interface IDoctorReport {
	readonly status: DoctorSectionStatus;
	readonly sections: readonly IDoctorSection[];
	readonly score: IDoctorScore;
	readonly ci?: IDoctorCiReport;
}
