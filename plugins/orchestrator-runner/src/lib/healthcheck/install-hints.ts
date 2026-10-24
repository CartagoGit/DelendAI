/**
 * install-hints.ts — how to install a missing provider CLI.
 *
 * CRITICAL I4: any hint whose install pipes a remote script into a shell
 * (`curl … | sh`) sets `pipeTo: 'sh'` and is flagged `dangerous: true`,
 * with a `caveat` warning, so a host never silently runs a piped-to-shell
 * installer. Hints without a `pipeTo` are ordinary package-manager
 * installs and are not dangerous.
 *
 * The hints are core's catalogue of known clients, keyed by the command a
 * provider invokes. Unknown commands fall back to a generic, non-dangerous
 * "install <command>" hint.
 */
import { knownClientOf } from '@delendai/core/contracts';

import type { IInstallHint } from '../types';

/** Install guidance for a CLI command, always non-`undefined`. */
export const installHintFor = (command: string): IInstallHint => {
	const known = knownClientOf(command)?.install;
	if (known !== undefined) return known;
	return {
		tool: command,
		args: [],
		dangerous: false,
		caveat: `No known installer for "${command}". Install it from its official source and ensure it is on PATH.`,
	};
};
