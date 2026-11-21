/**
 * host-config-parse.error.ts — the error a host config that cannot be
 * read raises.
 *
 * It lives in its own module because both the migrator and the reader
 * of that migrator's files raise it, and a module that imports a
 * migrator to get its error type drags the whole rewrite along with it.
 */
export class HostConfigParseError extends Error {
	readonly file: string;
	constructor(file: string, reason: string) {
		super(`host config ${file} is not valid JSON: ${reason}`);
		this.name = 'HostConfigParseError';
		this.file = file;
	}
}
