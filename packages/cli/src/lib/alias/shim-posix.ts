/**
 * shim-posix.ts — POSIX shim template for the `est` alias.
 *
 * b00239 S1: the canonical `delendai` binary is the only contract;
 * `est` is provisioned best-effort on POSIX systems via a tiny
 * shebang script that re-execs node with the canonical path.
 *
 * The script carries the ALIAS_MARKER so a later run can tell its
 * own shim from somebody else's and remove only what it created.
 */

import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';

export const POSIX_SHIM_BODY = (canonicalPath: string): string =>
	[
		'#!/bin/sh',
		`# ${ALIAS_MARKER}`,
		`exec node "${canonicalPath}" "$@"`,
		'',
	].join('\n');
