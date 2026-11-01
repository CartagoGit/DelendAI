import { describe, expect, it } from 'vitest';

// The release tooling lives at the repo root (scripts/), not inside a package.
// It is imported relatively so its pure flag-parsing logic is unit-tested and
// typechecked alongside the rest of the monorepo. `main()` itself stays
// untested by design (fs + spawn shell — see scripts/release.ts header).
import { parseFlags } from '../../../tools/scripts/release/release.script';

describe('parseFlags (f00033 — release provenance)', async () => {
	it('defaults to --tool=bun and --provenance=false', async () => {
		const flags = parseFlags([]);
		expect(flags.tool).toBe('bun');
		expect(flags.provenance).toBe(false);
	});

	it('accepts --tool=npm', async () => {
		const flags = parseFlags(['--tool=npm']);
		expect(flags.tool).toBe('npm');
	});

	it('accepts --provenance', async () => {
		const flags = parseFlags(['--tool=npm', '--provenance']);
		expect(flags.provenance).toBe(true);
	});

	it('rejects an unknown --tool value', async () => {
		expect(() => parseFlags(['--tool=yarn'])).toThrow(
			/--tool must be bun\|npm/,
		);
	});

	it('rejects --bump and --set together', async () => {
		expect(() => parseFlags(['--bump=patch', '--set=1.0.0'])).toThrow(
			/mutually exclusive/,
		);
	});

	it('parses --publish, --write and --no-validate independently of --provenance', async () => {
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
