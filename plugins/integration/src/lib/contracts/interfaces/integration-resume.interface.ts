export interface IResumePull {
	readonly number: number;
	readonly nodeId: string;
	readonly labels: readonly string[];
}

export interface IResumeForge {
	readonly openPulls: (base: string) => Promise<readonly IResumePull[]>;
	readonly markReady: (pull: IResumePull) => Promise<void>;
	readonly removeLabel: (number: number, label: string) => Promise<void>;
}
