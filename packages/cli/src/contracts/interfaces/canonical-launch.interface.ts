export type ICanonicalLaunchMode = 'bunx' | 'npx';

export interface ICanonicalLaunchOptions {
	readonly workspace: string;
	readonly preset?: string | undefined;
	readonly plugins?: readonly string[] | undefined;
	readonly mode?: ICanonicalLaunchMode | undefined;
}

export interface ICanonicalLaunch {
	readonly command: string;
	readonly args: readonly string[];
}
