/**
 * import-detectors.parity.spec.ts — each detector agrees with its lint.
 *
 * A plugin cannot import repository tooling, so the architecture report
 * ports each enforcing lint into a detector. That port is only worth
 * anything while it agrees with the lint, so every case here runs the
 * detector and the lint's own exported finder on the same text and
 * requires the same findings — first on a corpus of the shapes that
 * broke earlier attempts, then on every real file the lint reads.
 *
 * Scope is checked too: a detector that reads no files would agree with
 * everything, so each must read at least one real file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findViolations as clientLint } from '../../../../../../tools/scripts/lint/no-core-public-types-in-client.script';
import { findAbsoluteLocalImports } from '../../../../../../tools/scripts/lint/no-absolute-local-imports.script';
import { scanText } from '../../../../../../tools/scripts/lint/no-internal-core-imports.script';
import { findForbiddenModuleImports } from '../../../../../../tools/scripts/lint/no-node-imports-in-contracts.script';
import { findStateImportViolations } from '../../../../../../tools/scripts/lint/no-node-imports-in-state.script';
import {
	findTestSupportImports,
	isProductionSource,
} from '../../../../../../tools/scripts/lint/no-test-support-in-production.script';
import { ARCHITECTURE_SKIPPED_DIRECTORIES } from '../../../../src/lib/contracts/constants/import-detectors.constant';
import type { IImportDetectorId } from '../../../../src/lib/contracts/interfaces/layer-graph.interface';
import {
	allImportDetectors,
	importDetectorFor,
} from '../../../../src/lib/services/import-detectors.service';

// Built in parts: a literal `from '@delendai/<pkg>'` here reads as a real
// import to lint:workspace-deps-declared, which scans text, not syntax.
const STATE_SQLITE = ['@delendai', 'state-sqlite'].join('/');
const TEST_KIT = ['@delendai', 'test-kit'].join('/');
const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));

type Hit = { line: number; specifier: string };

/**
 * What each lint itself reports, reduced to comparable hits. A record, not
 * a switch: adding a detector without its lint here is a type error.
 */
const LINT_FINDERS: Readonly<
	Record<IImportDetectorId, (text: string, relPath: string) => readonly Hit[]>
> = {
	'no-node-imports-in-contracts': (text) =>
		findForbiddenModuleImports(text).map((f) => ({
			line: f.line,
			specifier: f.module,
		})),
	'no-node-imports-in-state': (text) =>
		findStateImportViolations(text).map((f) => ({
			line: f.line,
			specifier: f.module,
		})),
	// The client lint reports lines only.
	'no-core-public-types-in-client': (text) =>
		clientLint(text).map((f) => ({ line: f.line, specifier: '' })),
	'no-internal-core-imports': (text, relPath) =>
		scanText(text, join(REPO_ROOT, relPath), relPath).map((f) => ({
			line: f.line,
			specifier: f.specifier,
		})),
	'no-absolute-local-imports': (text, relPath) =>
		findAbsoluteLocalImports(text, relPath).map((f) => ({
			line: f.line,
			specifier: f.specifier,
		})),
	'no-test-support-in-production': (text, relPath) =>
		findTestSupportImports(text, relPath).map((f) => ({
			line: f.line,
			specifier: f.specifier,
		})),
};

const lintHits = (
	id: IImportDetectorId,
	text: string,
	relPath: string,
): readonly Hit[] => LINT_FINDERS[id](text, relPath);

const detectorHits = (id: IImportDetectorId, text: string): readonly Hit[] =>
	importDetectorFor(id)
		.detect(text)
		.map((hit) => ({
			line: hit.line,
			specifier:
				id === 'no-core-public-types-in-client' ? '' : hit.specifier,
		}));

const CORPUS: Readonly<Record<IImportDetectorId, readonly string[]>> = {
	'no-node-imports-in-contracts': [
		"import { a } from 'node:fs';\nimport { b } from 'path';",
		"import { rm } from 'node:fs/promises';",
		"import type { X } from '@delendai/core/public';",
		"// import { a } from 'node:fs';\n * from 'os'",
		"import { a } from 'fsx';\nimport { b } from '@delendai/contracts';",
		"import 'node:crypto';",
	],
	'no-node-imports-in-state': [
		"/**\n * doc\n */\nimport { a } from 'node:fs';",
		"const p = require('path');",
		`import { x } from '@delendai/core';\nimport type { S } from '${STATE_SQLITE}/lib';`,
		"import { ok } from '@delendai/stateful'; // import { a } from 'node:fs'",
		"const url = 'https://example.com'; import { a } from 'os';",
	],
	'no-core-public-types-in-client': [
		"import type {\n\tIFoo,\n\tIBar,\n} from '@delendai/core/public';",
		"import {\n\tcreateThing,\n\ttype IFoo,\n} from '@delendai/core/public';",
		"import type { IFoo } from '@delendai/core/contracts';",
		"import { createThing } from '@delendai/core/public';",
		"/**\n * import type { IFoo } from '@delendai/core/public';\n */",
		"import type { IFoo } from '@delendai/core-extras';",
	],
	'no-internal-core-imports': [
		"import { x } from '@delendai/core/lib/foo';",
		"export * from '@delendai/core/dist/index.js';",
		"const m = await import('../../packages/core/src/lib/x');",
		"const r = require('../../core/src/lib/y');",
		"import { ok } from '@delendai/core/public';",
		"import {\n\ta,\n\tb,\n} from '@delendai/core/lib/multi';",
	],
	'no-absolute-local-imports': [
		"import { x } from '/home/someone/project/src/x';",
		"import 'C:\\\\work\\\\x';",
		"const y = await import('/opt/app/y.js');",
		'const s = "import { x } from \'/home/fixture\'";',
		"// import { x } from '/home/commented';",
		"import { ok } from 'node:fs';",
	],
	'no-test-support-in-production': [
		`import { createFakeToolServer } from '${TEST_KIT}/public';`,
		"import '../testing/setup';\nconst m = await import('./thing.spec');",
		"import {\n\ta,\n} from '../../tests/helpers';",
		`// import { x } from '${TEST_KIT}';\nconst s = "from '${TEST_KIT}'";`,
		`import { ok } from '${TEST_KIT}-extras';\nimport { t } from './testimonials';`,
	],
};

describe('import detectors agree with their lints', () => {
	for (const detector of allImportDetectors()) {
		it(`${detector.id}: same findings on the corpus`, () => {
			for (const text of CORPUS[detector.id]) {
				expect(detectorHits(detector.id, text)).toEqual(
					lintHits(detector.id, text, 'fixture.ts'),
				);
			}
		});
	}

	it('the corpus is not vacuous: every detector flags something in it', () => {
		for (const detector of allImportDetectors()) {
			const flagged = CORPUS[detector.id].some(
				(text) => detector.detect(text).length > 0,
			);
			expect(flagged, detector.id).toBe(true);
		}
	});
});

const walkRepo = (dir: string, out: string[] = []): string[] => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!ARCHITECTURE_SKIPPED_DIRECTORIES.has(entry.name)) {
				walkRepo(full, out);
			}
		} else {
			out.push(relative(REPO_ROOT, full).split('\\').join('/'));
		}
	}
	return out;
};

describe('import detectors agree with their lints on the real tree', () => {
	const files = walkRepo(REPO_ROOT);

	for (const detector of allImportDetectors()) {
		it(`${detector.id}: identical on every file the lint reads`, () => {
			const inScope = files.filter((file) => detector.inScope(file));
			// A detector that reads nothing agrees with everything.
			expect(inScope.length, detector.id).toBeGreaterThan(0);
			for (const file of inScope) {
				const text = readFileSync(join(REPO_ROOT, file), 'utf8');
				expect(detectorHits(detector.id, text), file).toEqual(
					lintHits(detector.id, text, file),
				);
			}
		}, 120_000);
	}
});

describe('the test-support detector reads exactly what its lint reads', () => {
	it('agrees with isProductionSource on every file in the tree', () => {
		const detector = importDetectorFor('no-test-support-in-production');
		for (const file of walkRepo(REPO_ROOT)) {
			expect(detector.inScope(file), file).toBe(isProductionSource(file));
		}
	}, 120_000);
});

describe('detector scope mirrors each lint', () => {
	it.each([
		['no-node-imports-in-contracts', 'packages/contracts/src/a.ts', true],
		[
			'no-node-imports-in-contracts',
			'packages/contracts/src/a.spec.ts',
			false,
		],
		['no-node-imports-in-state', 'packages/state/src/a.tsx', true],
		['no-node-imports-in-state', 'plugins/demo/src/lib/state/a.ts', true],
		['no-node-imports-in-state', 'plugins/demo/src/lib/other/a.ts', false],
		[
			'no-core-public-types-in-client',
			'packages/client/src/a.test.ts',
			false,
		],
		['no-internal-core-imports', 'tools/scripts/foo/a.ts', true],
		['no-internal-core-imports', 'tools/scripts/lint/a.ts', false],
		['no-internal-core-imports', 'tools/scripts/test/a.ts', false],
		['no-absolute-local-imports', 'apps/web/x.mjs', true],
		['no-absolute-local-imports', 'docs/readme.md', false],
		['no-test-support-in-production', 'plugins/demo/src/lib/a.ts', true],
		[
			'no-test-support-in-production',
			'plugins/demo/src/lib/testing/a.helper.ts',
			false,
		],
		['no-test-support-in-production', 'packages/core/src/a.spec.ts', false],
		['no-test-support-in-production', 'packages/test-kit/src/a.ts', false],
		['no-test-support-in-production', 'tools/scripts/lint/a.ts', false],
	] as const)('%s reads %s: %s', (id, path, expected) => {
		expect(importDetectorFor(id).inScope(path)).toBe(expected);
	});
});
