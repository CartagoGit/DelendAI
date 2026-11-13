import type {
	IForgeExec,
	IForgeFailure,
	IForgeProvider,
} from './forge-read.interface';

export interface IForgeSearchCodeOptions {
	readonly query: string;
	readonly repo?: string | undefined;
	readonly language?: string | undefined;
	readonly limit?: number | undefined;
}

export interface IForgeCodeSearchHit {
	readonly path: string;
	readonly repository: string;
	readonly fragment: string;
}

export interface IForgeSearchCodeSuccess {
	readonly ok: true;
	readonly provider: IForgeProvider;
	readonly hits: readonly IForgeCodeSearchHit[];
}

export type IForgeSearchCodeResult = IForgeSearchCodeSuccess | IForgeFailure;

export type IForgeSearchExec = IForgeExec;
