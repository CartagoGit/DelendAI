import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// This package is Bun-only: every path through it opens a
		// `bun:sqlite` database, and `bun:sqlite` is a Bun builtin with no
		// node resolution. Under vitest these specs could never pass —
		// they failed at import while the driver's `bun:sqlite` import was
		// static, and once it became lazy they failed as reconcile runs
		// reporting `failed` instead of `ok`, which is a far more
		// confusing way to say the same thing.
		//
		// The suite is not lost: `bun run test:sqlite` runs it (133 tests)
		// and CI runs that script as its own step next to the cutover
		// gate. Emptying `include` here is what makes the vitest `tests`
		// job report the truth instead of ~40 permanently red tests that
		// no change to this package could ever fix.
		include: [],
		exclude: ['dist/**', 'node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'tests/**/*'],
		},
	},
});
