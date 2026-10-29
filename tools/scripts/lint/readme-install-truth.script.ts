#!/usr/bin/env bun
/**
 * readme-install-truth.script.ts — a README never tells a reader to install
 * a package that has not been released.
 *
 * The release record is the `vX.Y.Z` tags `release.yml` pushes before it
 * creates a GitHub release; the packages are versioned in lockstep, so one
 * tag means every `@delendai/*` package was published once. With no such
 * tag, any install command (`bunx`, `npx`, `bun add`, `npm install`, a
 * `"--package", "@delendai/x"` argument pair) naming an `@delendai`
 * package sends the reader to a 404. No network: only local tags are read.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The documents whose install commands are judged. */
export const README_FILES: readonly string[] = [
	'README.md',
	'docs/delendai/README-DELENDAI.md',
];

const INSTALL_VERB_RE =
	/\b(?:bunx|npx|bun\s+add|bun\s+x|npm\s+(?:i|install)|pnpm\s+(?:add|dlx)|yarn\s+(?:add|dlx))\b[^\n]*@delendai\/[\w-]+/u;
const PACKAGE_ARG_RE = /"--package",\s*"@delendai\/[\w-]+"/u;

/** `path:line` for every install command naming an @delendai package. */
export const installLines = (path: string, text: string): readonly string[] =>
	text
		.split('\n')
		.flatMap((line, index) =>
			INSTALL_VERB_RE.test(line) || PACKAGE_ARG_RE.test(line)
				? [`${path}:${String(index + 1)}`]
				: [],
		);

/** True when the tag list holds a release tag (`v1.2.3`). */
export const hasRelease = (tags: readonly string[]): boolean =>
	tags.some((tag) => /^v\d+\.\d+\.\d+/u.test(tag));

const main = (): number => {
	const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
		encoding: 'utf8',
	}).trim();
	const tags = execFileSync('git', ['tag', '--list', 'v*'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((tag) => tag.length > 0);
	if (hasRelease(tags)) {
		console.log('✓ readme-install-truth: a release tag exists.');
		return 0;
	}
	const found = README_FILES.flatMap((file) =>
		installLines(file, readFileSync(join(root, file), 'utf8')),
	);
	if (found.length === 0) {
		console.log(
			'✓ readme-install-truth: no release yet, and no README install command names an @delendai package.',
		);
		return 0;
	}
	console.error(
		`✖ readme-install-truth: no vX.Y.Z release tag exists, yet ${String(found.length)} README line(s) install an @delendai package:\n${found
			.map((line) => `  ${line}`)
			.join(
				'\n',
			)}\nUse the checkout (\`bun run cli:link\`, \`bun <checkout>/packages/cli/src/index.ts\`) until a release exists.`,
	);
	return 1;
};

if (import.meta.main) process.exit(main());
