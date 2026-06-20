#!/usr/bin/env bun
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = [
	'ARCHITECTURE-PROPOSALS.md',
	'ARCHITECTURE-AUDITS.md',
	'ARCHITECTURE-ADR.md',
	'ARCHITECTURE-WORKFLOWS.md',
	'ARCHITECTURE-TOOLS.md',
	'ARCHITECTURE-DOCS.md',
	'ARCHITECTURE-MEMORY.md',
] as const;

interface IIssue {
	readonly file: string;
	readonly message: string;
}

const hasHeading = (markdown: string, heading: string): boolean =>
	new RegExp(`^## ${heading}$`, 'm').test(markdown);

export const lintScaffolds = async (
	scaffoldsDir: string,
): Promise<readonly IIssue[]> => {
	const issues: IIssue[] = [];
	const entries = new Set(
		(await readdir(scaffoldsDir).catch(() => [])).filter((name) =>
			name.endsWith('.md'),
		),
	);
	for (const required of ['README.md', ...REQUIRED]) {
		if (!entries.has(required)) {
			issues.push({ file: required, message: 'missing scaffold file' });
		}
	}
	for (const file of REQUIRED) {
		const markdown = await readFile(join(scaffoldsDir, file), 'utf8').catch(
			() => '',
		);
		if (!/^---\n[\s\S]*?^applies-to:\s+\S+/m.test(markdown)) {
			issues.push({ file, message: 'missing applies-to frontmatter' });
		}
		for (const heading of ['Purpose', 'Required Shape', 'Validation']) {
			if (!hasHeading(markdown, heading)) {
				issues.push({ file, message: `missing ## ${heading}` });
			}
		}
	}
	return issues;
};

if (import.meta.main) {
	const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
	const issues = await lintScaffolds(join(repoRoot, 'docs', 'scaffolds'));
	for (const issue of issues) {
		console.log(`${issue.file}: ${issue.message}`);
	}
	if (issues.length > 0) process.exit(1);
	console.log('✓ scaffolds complete');
}
