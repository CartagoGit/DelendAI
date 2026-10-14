import type { parsePluginManifest } from '@delendai/core/runtime';

/** What a server's manifest made of it. */
export type IManifestPlugin =
	| { readonly kind: 'none' }
	| {
			readonly kind: 'plugin';
			readonly path: string;
			readonly manifest: ReturnType<typeof parsePluginManifest>;
	  }
	| {
			readonly kind: 'refused';
			readonly path: string;
			readonly reason: string;
	  };

export interface IManifestPluginInput {
	readonly workspaceRoot: string;
	readonly entry: {
		readonly command: string;
		readonly args: readonly string[];
		/** The host variables it asks for: names, or a name → value map. */
		readonly env?:
			| readonly string[]
			| Readonly<Record<string, string>>
			| undefined;
	};
	/** The file's text, or `undefined` when there is none. */
	readonly read: (
		path: string,
	) => Promise<string | undefined> | string | undefined;
}
