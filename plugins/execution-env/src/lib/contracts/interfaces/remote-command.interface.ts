/** Everything a remote command is built from. */
export interface IRemoteCommandParts {
	readonly command: readonly string[];
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
}
