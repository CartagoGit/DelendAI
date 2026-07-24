import type {
	IExternalToolRun,
	IProbeDeps,
	IRunExternalToolInput,
	FindingSeverity,
	IFinding,
} from '@mcp-vertex/core/public';

export type SastLanguage =
	| 'generic'
	| 'javascript'
	| 'typescript'
	| 'python'
	| 'go'
	| 'rust';

export interface ISastRule {
	readonly id: string;
	readonly severity: FindingSeverity;
	readonly language: SastLanguage;
	readonly pattern: string;
	readonly message: string;
}

export interface IDetectedStack {
	readonly pack:
		| 'generic'
		| 'javascript'
		| 'typescript'
		| 'python'
		| 'go'
		| 'rust'
		| 'mixed';
	readonly languages: readonly SastLanguage[];
	readonly files: readonly string[];
}

export type SastRunnerKind = 'semgrep' | 'ast-grep' | 'auto';

export interface IRunSastRunnerInput {
	readonly cwd: string;
	readonly rules: readonly ISastRule[];
	readonly runner?: SastRunnerKind;
	readonly timeoutMs?: number;
	readonly files?: readonly string[];
	readonly languages?: readonly SastLanguage[];
	readonly probeDeps?: IProbeDeps;
	readonly exec?: (input: IRunExternalToolInput) => Promise<IExternalToolRun>;
	readonly readTextFile?: (
		absolutePath: string,
	) => Promise<string | undefined>;
}

export interface ISastRunResult {
	readonly source: 'semgrep' | 'ast-grep' | 'fallback';
	readonly scanned: number;
	readonly findings: readonly IFinding[];
}

export interface ISecuritySastToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRootAbs: string;
	readonly detectStack?: (cwd: string) => Promise<IDetectedStack>;
	readonly runSastRunner?: (
		input: IRunSastRunnerInput,
	) => Promise<ISastRunResult>;
	readonly rules?: readonly ISastRule[];
}
