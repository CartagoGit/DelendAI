import type {
	IForgeExec,
	IForgeFailure,
	IForgeProvider,
} from './forge-read.interface';

export interface IForgeReleaseOptions {
	readonly tag: string;
	readonly notes?: string | undefined;
	readonly notesFile?: string | undefined;
	readonly target?: string | undefined;
	readonly prerelease?: boolean | undefined;
	readonly draft?: boolean | undefined;
	readonly confirm?: boolean | undefined;
}

export interface IForgeReleaseSuccess {
	readonly ok: true;
	readonly provider: IForgeProvider;
	readonly url: string;
	readonly id: string;
	readonly name: string;
	readonly title?: string | undefined;
	readonly tag: string;
	readonly draft: boolean;
	readonly prerelease: boolean;
}

export type IForgeReleaseResult = IForgeReleaseSuccess | IForgeFailure;

export type IForgeReleaseExec = IForgeExec;
