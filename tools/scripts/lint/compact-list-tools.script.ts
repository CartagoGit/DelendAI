#!/usr/bin/env bun
/**
 * compact-list-tools.script.ts — a new list tool answers compact by default
 * (f00645 S4).
 *
 * A tool that returns a list of full items by default spends the caller's
 * context on items it will not read: `review_queue` once answered 624 KB
 * for one call. The measured largest list tools were made compact (S3);
 * this keeps new ones from arriving in the old shape.
 *
 * A finding is a tool whose output has an array of objects with more than
 * five fields, and whose input takes neither an item id (`id`, `…Id`,
 * `…_id`) nor `detail`. A list whose entries carry their own `detailsId`
 * is compact already: the detail is one call away. Existing findings are
 * baselined by tool name; a new one fails.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
	IHarvestedTool,
	IJsonSchemaNode,
} from '../types/emit-tool-types.script';

/** More fields than this in a listed item is a full item, not an entry. */
const MAX_ENTRY_FIELDS = 5;

const ID_INPUT = /^(?:id|.+Id|.+_id)$/u;

const BASELINE = join(
	dirname(fileURLToPath(import.meta.url)),
	'compact-list-tools.baseline.json',
);

export interface ICompactListFinding {
	readonly tool: string;
	/** The output property that lists full items. */
	readonly path: string;
	readonly fields: number;
}

const objectsOf = (node: IJsonSchemaNode): readonly IJsonSchemaNode[] =>
	[node, ...(node.anyOf ?? []), ...(node.oneOf ?? [])].filter(
		(candidate) => candidate.properties !== undefined,
	);

/** Arrays of objects anywhere in `node`, with their property path. */
const listsIn = (
	node: IJsonSchemaNode,
	path: string,
): { path: string; item: IJsonSchemaNode }[] =>
	objectsOf(node).flatMap((object) =>
		Object.entries(object.properties ?? {}).flatMap(([key, child]) => {
			const here = path === '' ? key : `${path}.${key}`;
			const items = child.items;
			const listed =
				items === undefined
					? []
					: objectsOf(items).map((item) => ({ path: here, item }));
			return [...listed, ...listsIn(child, here)];
		}),
	);

const takesDetail = (input: IJsonSchemaNode | undefined): boolean =>
	Object.keys(input?.properties ?? {}).some(
		(key) => key === 'detail' || ID_INPUT.test(key),
	);

/** The tools that list full items by default. */
export const compactListFindings = (
	tools: readonly IHarvestedTool[],
): readonly ICompactListFinding[] =>
	tools.flatMap((tool) => {
		if (takesDetail(tool.input)) return [];
		return listsIn(tool.schema, '')
			.filter(({ item }) => {
				const fields = Object.keys(item.properties ?? {});
				return (
					fields.length > MAX_ENTRY_FIELDS &&
					!fields.includes('detailsId')
				);
			})
			.map(({ path, item }) => ({
				tool: tool.name,
				path,
				fields: Object.keys(item.properties ?? {}).length,
			}));
	});

/** Findings the baseline does not name. */
export const newFindings = (
	findings: readonly ICompactListFinding[],
	baseline: readonly string[],
): readonly ICompactListFinding[] => {
	const known = new Set(baseline);
	return findings.filter((finding) => !known.has(finding.tool));
};

const readBaseline = (): readonly string[] => {
	try {
		return JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];
	} catch {
		return [];
	}
};

const main = async (): Promise<void> => {
	const { harvestToolSchemas } = await import(
		'../types/generate-tool-types.script'
	);
	const tools = await harvestToolSchemas();
	if (tools.length === 0) {
		console.error(
			'✖ compact-list-tools: harvested no tool; nothing was measured.',
		);
		process.exit(1);
	}
	const findings = compactListFindings(tools);
	if (process.argv.includes('--update')) {
		const names = [
			...new Set(findings.map((finding) => finding.tool)),
		].sort();
		writeFileSync(
			BASELINE,
			`[\n${names.map((name) => `\t${JSON.stringify(name)}`).join(',\n')}\n]\n`,
		);
		console.log(
			`compact-list-tools: baseline updated — ${names.length} tool(s).`,
		);
		return;
	}
	const fresh = newFindings(findings, readBaseline());
	if (fresh.length === 0) {
		console.log(
			`✓ compact-list-tools: ${tools.length} tools, no new list of full items (${readBaseline().length} baselined).`,
		);
		return;
	}
	console.error(
		`✖ compact-list-tools: ${fresh.length} list(s) of full items by default:`,
	);
	for (const finding of fresh) {
		console.error(
			`  ${finding.tool}: ${finding.path} lists items of ${finding.fields} fields`,
		);
	}
	console.error(
		'\n  Return entries (identity, state, next action) by default; take an item id for one item and `detail: true` for the whole page. `review_queue` is the reference.',
	);
	process.exit(1);
};

// The harvested server leaves watchers behind; the verdict is final here.
if (import.meta.main) {
	await main();
	process.exit(0);
}
