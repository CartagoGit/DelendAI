#!/usr/bin/env bun
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const repoRoot = process.cwd();
const proposalsRoot = join(repoRoot, 'docs/delendai/proposals');
const activeRoots = ['ready', 'blocked', 'review'];
const canonicalSections = new Set([
	'goal',
	'why',
	'why this design',
	'non-goals',
	'architecture',
	'slices',
	'dependency graph',
	'acceptance',
	'risks and mitigations',
	'notes',
]);

const walk = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(abs)));
		else if (entry.isFile() && entry.name.endsWith('.md')) files.push(abs);
	}
	return files;
};

const section = (name: string, body: readonly string[]): string[] => [
	`## ${name}`,
	'',
	...body,
	'',
];

const repair = (raw: string): string => {
	if (!/^track:\s*migrated\s*$/m.test(raw)) return raw;
	let lines = raw.split('\n');
	const id = lines
		.find((line) => /^id:\s*/.test(line))
		?.replace(/^id:\s*/, '')
		.trim();
	if (id !== undefined) {
		lines = lines.map((line) => {
			if (!/^title:\s*/.test(line)) return line;
			const title = line
				.replace(/^title:\s*/, '')
				.trim()
				.replace(/^['"]|['"]$/g, '');
			return title.length >= 8
				? line
				: `title: "Migrated work item ${id}"`;
		});
	}
	const headings = new Set(
		lines
			.filter((line) => /^##\s+/.test(line))
			.map((line) =>
				line
					.replace(/^##\s+/, '')
					.trim()
					.toLowerCase(),
			),
	);
	const repaired = [...lines];
	const headingIndex = (name: string): number =>
		repaired.findIndex(
			(line) => line.trim().toLowerCase() === `## ${name}`,
		);
	const insertBefore = (
		names: readonly string[],
		content: string[],
	): void => {
		const index = repaired.findIndex((line) => {
			const normalized = line.trim().toLowerCase();
			return names.some((name) => normalized === `## ${name}`);
		});
		repaired.splice(index < 0 ? repaired.length : index, 0, ...content);
	};

	if (!headings.has('why')) {
		const goal = headingIndex('goal');
		const next = repaired.findIndex(
			(line, index) => index > goal && /^##\s+/.test(line),
		);
		repaired.splice(
			next < 0 ? repaired.length : next,
			0,
			...section('why', [
				'Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.',
			]),
		);
	}
	if (!headings.has('non-goals')) {
		insertBefore(
			['slices', 'acceptance', 'notes'],
			section('non-goals', [
				'- Preserve the source document as an independently editable proposal.',
			]),
		);
	}
	if (!headings.has('slices')) {
		insertBefore(
			['acceptance', 'notes'],
			[
				...section('Slices', [
					'### S1 — Review migrated proposal',
					'',
					'- **Status**: pending',
					'- **Files**: `TODO`',
					'- **Gate**: none',
				]),
			],
		);
	}
	if (!headings.has('acceptance')) {
		insertBefore(
			['notes'],
			section('acceptance', [
				'- The migrated proposal is reviewed and its files and validation gate are made explicit.',
			]),
		);
	}
	const seenCanonical = new Set<string>();
	const normalized = repaired.map((line) => {
		const match = /^(##)\s+(.+)$/.exec(line);
		if (match === null) return line;
		const name = (match[2] ?? '')
			.replace(/^\d+\.\s*/, '')
			.trim()
			.toLowerCase();
		if (!canonicalSections.has(name) || seenCanonical.has(name)) {
			return `### ${match[2] ?? ''}`;
		}
		seenCanonical.add(name);
		return line;
	});
	return normalized.join('\n');
};

let changed = 0;
for (const root of activeRoots) {
	for (const file of await walk(join(proposalsRoot, root))) {
		const raw = await readFile(file, 'utf8');
		const next = repair(raw);
		if (next !== raw) {
			await writeFile(file, next, 'utf8');
			changed += 1;
		}
	}
}
console.log(`repaired ${changed} migrated proposal scaffold(s)`);
