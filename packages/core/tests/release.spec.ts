import { describe, expect, it } from 'vitest';

// The release tooling lives at the repo root (scripts/), not inside a package.
// It is imported relatively so its pure flag-parsing logic is unit-tested and
// typechecked alongside the rest of the monorepo. `main()` itself stays
// untested by design (fs + spawn shell — see scripts/release.ts header).
import { parseFlags } from '../../../scripts/release';

describe('parseFlags (l00012 — release provenance)', () => {
	it('defaults to --tool=bun and --provenance=false', () => {
		const flags = parseFlags([]);
		expect(flags.tool).toBe('bun');
		expect(flags.provenance).toBe(false);
	});

	it('accepts --tool=npm', () => {
		const flags = parseFlags(['--tool=npm']);
		expect(flags.tool).toBe('npm');
	});

	it('accepts --provenance', () => {
		const flags = parseFlags(['--tool=npm', '--provenance']);
		expect(flags.provenance).toBe(true);
	});

	it('rejects an unknown --tool value', () => {
		expect(() => parseFlags(['--tool=yarn'])).toThrow(
			/--tool must be bun\|npm/,
		);
	});

	it('rejects --bump and --set together', () => {
		expect(() => parseFlags(['--bump=patch', '--set=1.0.0'])).toThrow(
			/mutually exclusive/,
		);
	});

	it('parses --publish, --write and --no-validate independently of --provenance', () => {
		const flags = parseFlags([
			'--set=1.2.3',
			'--write',
			'--publish',
			'--no-validate',
			'--tool=npm',
			'--provenance',
		]);
		expect(flags).toMatchObject({
			target: { set: '1.2.3' },
			write: true,
			publish: true,
			validate: false,
			tool: 'npm',
			provenance: true,
		});
	});
});
