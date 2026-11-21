/**
 * affected-specs.service.ts — the specs a change can affect, by symbol.
 *
 * Following imports module by module, a change anywhere in core reached 1,362
 * of 2,407 specs: nearly every spec imports a barrel, and a barrel imports
 * everything. What a spec depends on is the names it imports, so a name asked
 * of a barrel is followed through its re-exports to the module that declares
 * it, and only that module's own imports are followed from there. The same
 * change then reaches 240 specs, found in under a second.
 *
 * Importing a barrel still evaluates every module behind it, so a changed
 * file that runs code when it loads (a call, a registration, a branch at its
 * top level) is followed module by module instead: whatever imports anything
 * that leads to it is affected.
 *
 * One answer for every caller: the forge's test plan and the local proof.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { affectedFiles, createResolver, factsOf } from '@delendai/core/runtime';

import type { IAffectedSpecsInput } from './affected-specs.interface';
import {
	isTestKitSource,
	SHARED_VITEST_CONFIG,
	setupFilesOf,
	testInfrastructureSpecs,
} from './test-infrastructure';

export {
	affectedFiles,
	createResolver,
	factsOf,
	runsCodeWhenLoaded,
	topLevelStatements,
} from '@delendai/core/runtime';

const SPEC = /\.(spec|test)\.tsx?$/u;

/**
 * The setup files and every module they import, transitively, followed
 * module by module: a setup runs before every spec, so all it loads is
 * loaded by every spec.
 */
export const setupClosureOf = (
	input: IAffectedSpecsInput,
): ReadonlySet<string> => {
	const known = new Set(input.files.filter((file) => /\.tsx?$/u.test(file)));
	const resolve = createResolver(known, input.paths);
	const seen = new Set<string>();
	const queue = (input.setupFiles ?? []).filter((file) => known.has(file));
	for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
		if (seen.has(next)) continue;
		seen.add(next);
		const module = factsOf(input.read(next), (specifier) =>
			resolve(next, specifier),
		);
		for (const target of [
			...module.imports.map((each) => each.target),
			...module.reexports.map((each) => each.from),
		])
			if (!seen.has(target)) queue.push(target);
	}
	return seen;
};

/**
 * The specs the change reaches through the shared test setup
 * (`test-infrastructure`), test-kit changes followed by symbol.
 */
export const testInfrastructureSpecsOf = (
	input: IAffectedSpecsInput,
	kitReached?: ReadonlySet<string>,
): readonly string[] => {
	const kit = input.changed.filter(isTestKitSource);
	return testInfrastructureSpecs({
		changed: input.changed,
		specs: input.files,
		setupClosure: setupClosureOf(input),
		kitReached:
			kitReached ??
			(kit.length === 0
				? new Set<string>()
				: new Set(affectedFiles({ ...input, changed: kit }))),
	});
};

/** The specs `changed` can affect, from the tracked files and their text. */
export const affectedSpecs = (
	input: IAffectedSpecsInput,
): readonly string[] => {
	const reached = affectedFiles(input);
	return [
		...new Set([
			...reached.filter((file) => SPEC.test(file)),
			// What the module graph reaches already holds the test kit's reach.
			...testInfrastructureSpecsOf(input, new Set(reached)),
		]),
	].sort();
};

/** The setup files the shared vitest config of `root` names. */
export const setupFilesAt = (
	root: string,
	files: readonly string[],
): readonly string[] => {
	try {
		return setupFilesOf(
			readFileSync(join(root, SHARED_VITEST_CONFIG), 'utf8'),
			files,
		);
	} catch {
		// No shared config: no setup file every spec loads.
		return [];
	}
};

/** The repository as git has it, and the branch's change since `base`. */
export const repositorySince = (
	root: string,
	base: string,
): IAffectedSpecsInput => {
	const git = (args: readonly string[]): readonly string[] =>
		execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		})
			.split('\n')
			.filter((line) => line.length > 0);
	const config = JSON.parse(
		readFileSync(join(root, 'tsconfig.base.json'), 'utf8'),
	) as { compilerOptions?: { paths?: Record<string, readonly string[]> } };
	const files = git(['ls-files']);
	return {
		files,
		changed: git(['diff', '--name-only', `${base}...HEAD`]),
		read: (file) => readFileSync(join(root, file), 'utf8'),
		paths: config.compilerOptions?.paths ?? {},
		setupFiles: setupFilesAt(root, files),
	};
};

/** The specs a branch's change since `base` can affect, read from git. */
export const affectedSpecsSince = (
	root: string,
	base: string,
): readonly string[] => affectedSpecs(repositorySince(root, base));
