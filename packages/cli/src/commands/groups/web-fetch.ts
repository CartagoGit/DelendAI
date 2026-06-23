/**
 * f00046 S8 — web-fetch command. Delegates 1:1 to `web-fetch_web_fetch`,
 * the opt-in, allow-listed, fail-closed URL fetcher.
 *
 * Tools mapped:
 *   - `web-fetch_web_fetch` ({ url, maxBytes?, timeoutMs? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	numberArg,
	positionalArg,
	request,
	usage,
} from './group-helpers';

const webFetchCommand: ICliCommand = {
	name: 'web-fetch',
	summary: 'Fetch one allow-listed URL and return capped text (opt-in).',
	async run(args, ctx) {
		const url = positionalArg(args);
		if (url === undefined) {
			return usage('web-fetch <url> [--max-bytes=N] [--timeout=N]');
		}
		const maxBytes =
			numberArg(args, 'max-bytes') ?? numberArg(args, 'maxBytes');
		const timeoutMs =
			numberArg(args, 'timeout') ?? numberArg(args, 'timeoutMs');
		return data(
			await request(ctx, 'web-fetch_web_fetch', {
				url,
				...(maxBytes !== undefined ? { maxBytes } : {}),
				...(timeoutMs !== undefined ? { timeoutMs } : {}),
			}),
		);
	},
};

export const webFetchCommands: readonly ICliCommand[] = [webFetchCommand];
