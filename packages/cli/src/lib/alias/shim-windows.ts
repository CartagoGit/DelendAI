/**
 * shim-windows.ts — Windows shim templates for the `est` alias.
 *
 * b00239 S1: Windows resolves executables through PATHEXT, so an
 * extensionless file is not runnable from `cmd` and a `.cmd` shim is
 * not seen by PowerShell scripts that call the bare name. Both are
 * written, which is what "not a Unix-only solution" means concretely.
 *
 * Both shims carry the ALIAS_MARKER so a later run can tell its own
 * work from somebody else's.
 */

import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';

export const WINDOWS_CMD_SHIM_BODY = (canonicalPath: string): string =>
	['@echo off', `:: ${ALIAS_MARKER}`, `node "${canonicalPath}" %*`, ''].join(
		'\r\n',
	);

export const WINDOWS_PS1_SHIM_BODY = (canonicalPath: string): string =>
	[`# ${ALIAS_MARKER}`, `node "${canonicalPath}" @args`, ''].join('\r\n');
