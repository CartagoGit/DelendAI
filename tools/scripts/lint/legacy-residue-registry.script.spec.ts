import { describe, expect, it } from 'vitest';

import {
	currentEmittedNames,
	judgeLegacyResidue,
	registryNames,
} from './legacy-residue-registry.script';

const NAMED: ReadonlySet<string> = new Set(['old.json']);

describe('legacy-residue-registry', () => {
	it('[<20ms] measures the names the current release emits', () => {
		expect(currentEmittedNames()).toContain('server-name:delendai');
		expect(registryNames().size).toBeGreaterThan(0);
	});

	it('[<20ms] passes when nothing was removed', () => {
		const verdict = judgeLegacyResidue({ names: ['a:x'] }, ['a:x'], NAMED);
		expect(verdict.ok).toBe(true);
	});

	it('[<20ms] fails when a removed name is carried by no entry', () => {
		const verdict = judgeLegacyResidue(
			{ names: ['a:x', 'b:y'] },
			['a:x'],
			NAMED,
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.message).toContain('b:y');
	});

	it('[<20ms] passes when a registry entry names the removed value', () => {
		const verdict = judgeLegacyResidue(
			{ names: ['a:x', 'config-file:old.json'] },
			['a:x'],
			NAMED,
		);
		expect(verdict.ok).toBe(true);
	});

	it('[<20ms] fails on an empty scan and asks for a re-record when names were added', () => {
		expect(judgeLegacyResidue({ names: [] }, ['a:x'], NAMED).ok).toBe(
			false,
		);
		expect(judgeLegacyResidue({ names: ['a:x'] }, [], NAMED).ok).toBe(
			false,
		);
		const stale = judgeLegacyResidue(
			{ names: ['a:x'] },
			['a:x', 'c:z'],
			NAMED,
		);
		expect(stale.ok).toBe(false);
		if (!stale.ok) expect(stale.message).toContain('--update');
	});
});
