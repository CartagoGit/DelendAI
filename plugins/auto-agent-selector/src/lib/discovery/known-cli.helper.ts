/**
 * known-cli.helper.ts — a known client as the roster detects it.
 */
import type { IKnownClient } from '@delendai/core/contracts';

import type { IKnownCli } from '../contracts/constants/known-providers.constant';

/** The CLI entry a client is detected and installed by. */
export const cliEntryOf = (client: IKnownClient): IKnownCli => ({
	id: client.id,
	label: client.label,
	vendor: client.vendor,
	command: client.command,
	costTier: client.costTier,
	installHint: `${[client.install.tool, ...client.install.args].join(' ')}${client.install.pipeTo === undefined ? '' : ` | ${client.install.pipeTo}`}`,
	...(client.install.pipeTo === undefined || client.install.tool === ''
		? client.install.tool === ''
			? {}
			: {
					installArgv: [
						client.install.tool,
						...client.install.args,
					] as [string, ...string[]],
				}
		: {}),
});
