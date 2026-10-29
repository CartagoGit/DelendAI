export interface IDockerLogLine {
	readonly timestamp: string;
	readonly stream: 'stdout' | 'stderr' | 'unknown';
	readonly message: string;
}

export interface IDockerLogsInput {
	readonly container: string;
	readonly tail?: number;
	readonly since?: string;
}

export interface IDockerLogsDeps {
	readonly exec: (
		cmd: readonly string[],
	) => Promise<{ stdout: string; stderr: string }>;
	readonly probeBinary: (
		name: string,
	) => Promise<{ present: boolean; hint?: string }>;
}

export type IDockerLogsResult =
	| {
			readonly kind: 'docker-logs';
			readonly container: string;
			readonly lines: readonly IDockerLogLine[];
	  }
	| {
			readonly kind: 'skipped';
			readonly hint: string;
	  };
