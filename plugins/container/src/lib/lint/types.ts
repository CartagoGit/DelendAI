/**
 * types.ts — f00133 S2: shared Dockerfile-lint types.
 */
export type IDockerfileInstructionCommand =
	| 'FROM'
	| 'RUN'
	| 'CMD'
	| 'ENTRYPOINT'
	| 'ENV'
	| 'ARG'
	| 'COPY'
	| 'ADD'
	| 'WORKDIR'
	| 'USER'
	| 'EXPOSE'
	| 'VOLUME'
	| 'LABEL'
	| 'HEALTHCHECK'
	| 'SHELL'
	| 'MAINTAINER'
	| 'STOPSIGNAL';

export interface IDockerfileInstruction {
	readonly line: number;
	readonly command: IDockerfileInstructionCommand;
	readonly args: string;
	readonly raw: string;
}

export interface IDockerfileFindingLocation {
	readonly file: string;
	readonly line?: number;
}

export interface IDockerfileFinding {
	readonly ruleId: string;
	readonly severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
	readonly message: string;
	readonly location?: IDockerfileFindingLocation;
	readonly fix?: string;
}

export interface IDockerfileLintInput {
	readonly source: string;
	readonly file?: string;
}

export interface IDockerfileLintResult {
	readonly kind: 'dockerfile-lint';
	readonly findings: readonly IDockerfileFinding[];
}
