#!/usr/bin/env bun
/**
 * no-test-support-in-production — production source may not import test
 * support.
 *
 * Fakes belong in `@delendai/test-kit`, and specs may import them. Code
 * that ships may not: a fake reached from `src/` either leaks into the
 * published package or keeps a test dependency alive at runtime, and a
 * fake that two packages need belongs in the kit rather than being copied
 * next to one of them.
 *
 * Production source is every `.ts`/`.tsx`/`.mts`/`.cts` file under
 * `packages/<pkg>/src/` or `plugins/<plugin>/src/`, except specs, files
 * under a `tests/`, `testing/`, `__tests__/` or `fixtures/` directory, and
 * the test-kit package itself. Test support is `@delendai/test-kit` (and
 * its subpaths) and any relative specifier that walks into one of those
 * directories or names a spec.
 *
 * Matching reuses the anchored patterns of `no-absolute-local-imports`,
 * so a fixture that DESCRIBES an import inside a string is not one.
 *
 * Exit codes:
 *   0 — no production file imports test support.
 *   1 — at least one; every offender is printed with file:line.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';
import { SPECIFIER_PATTERNS } from './no-absolute-local-imports.script';

export interface ITestSupportImportFinding {
	readonly file: string;
	readonly line: number;
	readonly specifier: string;
}

const PRODUCTION_ROOT = /^(?:packages|plugins)\/[^/]+\/src\//u;
const PRODUCTION_EXTENSION = /\.(?:ts|tsx|mts|cts)$/u;
const SPEC_FILE = /\.(?:spec|test)\.[a-z]+$/u;
const TEST_SUPPORT_DIRECTORY =
	/(?:^|\/)(?:tests|testing|__tests__|fixtures)\//u;
const TEST_KIT_PACKAGE = 'packages/test-kit/';
const TEST_KIT_SPECIFIER = /^@delendai\/test-kit(?:\/|$)/u;
const RELATIVE_INTO_TEST_SUPPORT =
	/^\.{1,2}\/(?:.*\/)?(?:test-kit|tests|testing|__tests__|fixtures)(?:\/|$)/u;
const RELATIVE_SPEC = /^\.{1,2}\/.*\.(?:spec|test)(?:\.[a-z]+)?$/u;

/** True when `relPath` is source that ships, not test support. */
export const isProductionSource = (relPath: string): boolean =>
	PRODUCTION_ROOT.test(relPath) &&
	PRODUCTION_EXTENSION.test(relPath) &&
	!SPEC_FILE.test(relPath) &&
	!TEST_SUPPORT_DIRECTORY.test(relPath) &&
	!relPath.startsWith(TEST_KIT_PACKAGE);

/** True when importing `specifier` reaches test support. */
export const isTestSupportSpecifier = (specifier: string): boolean =>
	TEST_KIT_SPECIFIER.test(specifier) ||
	RELATIVE_INTO_TEST_SUPPORT.test(specifier) ||
	RELATIVE_SPEC.test(specifier);

/** Pure: every test-support specifier in one file's text. */
export const findTestSupportImports = (
	text: string,
	relPath: string,
): readonly ITestSupportImportFinding[] => {
	const findings: ITestSupportImportFinding[] = [];
	const lines = text.split('\n');
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
		for (const pattern of SPECIFIER_PATTERNS) {
			const specifier = pattern.exec(line)?.[1];
			if (specifier === undefined) continue;
			if (!isTestSupportSpecifier(specifier)) continue;
			findings.push({ file: relPath, line: index + 1, specifier });
			break;
		}
	}
	return findings;
};

export const formatReport = (
	findings: readonly ITestSupportImportFinding[],
	scanned: number,
): string => {
	if (scanned === 0) {
		return '✗ no-test-support-in-production: no production source was found, which is not evidence of a clean tree.\n';
	}
	if (findings.length === 0) {
		return `✓ no-test-support-in-production: ${scanned} production file(s), none imports test support.\n`;
	}
	return [
		`✗ no-test-support-in-production: ${findings.length} import(s) of test support from production source.`,
		'',
		...findings.map(
			(finding) =>
				`  ${finding.file}:${finding.line}\n    ${finding.specifier}`,
		),
		'',
		'  Specs may import `@delendai/test-kit`; code that ships may not.',
		'  Move the importing code under `tests/` (or a `testing/` helper used',
		'  only by specs), or move what it needs out of the kit into source.',
		'',
	].join('\n');
};

const main = async (): Promise<number> => {
	const root = repoRoot();
	const files = execFileSync('git', ['ls-files', 'packages', 'plugins'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.filter(isProductionSource);
	const findings: ITestSupportImportFinding[] = [];
	for (const file of files) {
		const text = await readFile(join(root, file), 'utf8').catch(() => '');
		findings.push(...findTestSupportImports(text, file));
	}
	process.stdout.write(formatReport(findings, files.length));
	return files.length > 0 && findings.length === 0 ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
