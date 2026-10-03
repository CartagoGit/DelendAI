/**
 * shim.spec.ts — b00239 S1 acceptance: Windows + POSIX shims.
 *
 * Verifies:
 *   - The POSIX shebang carries the ALIAS_MARKER.
 *   - The Windows .cmd shim carries the marker and ends in CRLF.
 *   - The Windows .ps1 shim carries the marker.
 *   - The canonical path appears inside each body.
 *   - Bodies are byte-distinct: each platform emits its own template.
 */

import { describe, expect, it } from 'vitest';

import { ALIAS_MARKER } from '../../contracts/constants/alias.constant';
import { POSIX_SHIM_BODY } from './shim-posix';
import { WINDOWS_CMD_SHIM_BODY, WINDOWS_PS1_SHIM_BODY } from './shim-windows';

describe('shim templates (b00239 S1)', () => {
	const canonical = '/opt/delendai/bin/delendai';

	it('POSIX shim carries the marker and the canonical path', () => {
		const body = POSIX_SHIM_BODY(canonical);
		expect(body).toContain(ALIAS_MARKER);
		expect(body).toContain(canonical);
		expect(body.startsWith('#!/bin/sh')).toBe(true);
		expect(body).toContain('exec node');
	});

	it('Windows .cmd shim carries the marker, the canonical path, and CRLF', () => {
		const body = WINDOWS_CMD_SHIM_BODY(canonical);
		expect(body).toContain(ALIAS_MARKER);
		expect(body).toContain(canonical);
		expect(body).toContain('@echo off');
		expect(body).toContain('node');
		// CRLF line endings are required so the marker is detectable
		// by `readAliasState` even when the file was written via
		// Windows console redirection (which strips bare LF).
		expect(body).toContain('\r\n');
	});

	it('Windows .ps1 shim carries the marker and the canonical path', () => {
		const body = WINDOWS_PS1_SHIM_BODY(canonical);
		expect(body).toContain(ALIAS_MARKER);
		expect(body).toContain(canonical);
		expect(body).toContain('node');
		expect(body.startsWith('#')).toBe(true);
	});

	it('three shim bodies are byte-distinct', () => {
		const posix = POSIX_SHIM_BODY(canonical);
		const cmd = WINDOWS_CMD_SHIM_BODY(canonical);
		const ps1 = WINDOWS_PS1_SHIM_BODY(canonical);
		expect(posix).not.toBe(cmd);
		expect(posix).not.toBe(ps1);
		expect(cmd).not.toBe(ps1);
	});

	it('marker is the same across all three templates (so recognise-ours works)', () => {
		expect(POSIX_SHIM_BODY(canonical)).toContain(ALIAS_MARKER);
		expect(WINDOWS_CMD_SHIM_BODY(canonical)).toContain(ALIAS_MARKER);
		expect(WINDOWS_PS1_SHIM_BODY(canonical)).toContain(ALIAS_MARKER);
	});
});
