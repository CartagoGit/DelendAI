#!/usr/bin/env bun
/**
 * work-progress.script.ts — where the open proposals stand, and who is at
 * work, from the events real work already leaves.
 *
 *   bun run work:progress                 one view
 *   bun run work:progress -- --watch      redraw in place until interrupted
 *   bun run work:progress -- --agents     only the agents at work
 *   bun run work:progress -- --json       the rows, for another program
 *
 * It first drains the journals published code appends to, so the view is
 * as fresh as the last unit entered or published. No model is involved:
 * the proposals on disk and the event store are all it reads.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
	DurationHistoryFacade,
	WATCH_INTERVAL_MS,
	WorkEventStoreFacade,
	activeAgents,
	buildWorkStatus,
	drainTelemetryJournals,
	renderWorkStatus,
	workItemsOf,
	type IWorkStatusProposal,
} from '@delendai/state-telemetry/public';
import { resolveDevelopmentPolicy } from '@delendai/core/public';

const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const workspaceArg = process.argv
	.find((arg) => arg.startsWith('--workspace='))
	?.slice('--workspace='.length);

/** The folders a proposal is open in; the rest are closed or retired. */
const OPEN_STATUSES = ['in-progress', 'ready', 'review', 'blocked'] as const;

const sharedRoot = (from: string): string => {
	try {
		return dirname(
			execFileSync(
				'git',
				['rev-parse', '--path-format=absolute', '--git-common-dir'],
				{ cwd: from, encoding: 'utf8' },
			).trim(),
		);
	} catch {
		return from;
	}
};

const markdownUnder = (dir: string): readonly string[] => {
	try {
		return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory()
				? markdownUnder(join(dir, entry.name))
				: entry.name.endsWith('.md') && entry.name !== 'README.md'
					? [join(dir, entry.name)]
					: [],
		);
	} catch {
		return [];
	}
};

const readProposals = (
	root: string,
	docsDir: string,
): readonly IWorkStatusProposal[] =>
	OPEN_STATUSES.flatMap((status) =>
		markdownUnder(join(root, docsDir, 'proposals', status)),
	)
		.map((path) => {
			const markdown = readFileSync(path, 'utf8');
			return {
				id: /^id:\s*(\S+)/mu.exec(markdown)?.[1] ?? '',
				title:
					/^title:\s*"?(.*?)"?\s*$/mu.exec(markdown)?.[1] ??
					'(untitled)',
				markdown,
			};
		})
		.filter((proposal) => proposal.id.length > 0)
		.sort((left, right) => left.id.localeCompare(right.id));

const docsDirOf = (root: string): string => {
	try {
		const config = JSON.parse(
			readFileSync(join(root, 'delendai.config.json'), 'utf8'),
		) as { readonly docsDir?: unknown; readonly development?: unknown };
		// Read for its side effect of refusing a malformed policy early.
		resolveDevelopmentPolicy({
			...(typeof config.development === 'object' &&
			config.development !== null
				? { development: config.development as Record<string, unknown> }
				: {}),
		});
		return typeof config.docsDir === 'string'
			? config.docsDir
			: 'docs/delendai';
	} catch {
		return 'docs/delendai';
	}
};

const view = async (root: string): Promise<string> => {
	const events = new WorkEventStoreFacade({ workspaceRoot: root });
	const history = new DurationHistoryFacade({
		path: join(root, '.cache/delendai/telemetry/duration-history.sqlite'),
	});
	try {
		await drainTelemetryJournals({ root, events, history });
		const proposals = readProposals(root, docsDirOf(root));
		const all = (
			await Promise.all(
				proposals
					.flatMap(workItemsOf)
					.map((item) =>
						events.listByWorkItem(
							item.workItemId as Parameters<
								typeof events.listByWorkItem
							>[0],
						),
					),
			)
		).flat();
		const now = Date.now();
		const rows = buildWorkStatus({ proposals, events: all, now });
		const agents = activeAgents(all, now);
		if (flag('json')) return JSON.stringify({ rows, agents });
		return renderWorkStatus(flag('agents') ? [] : rows, agents, now);
	} finally {
		events.close();
		history.close();
	}
};

const main = async (): Promise<void> => {
	const root = sharedRoot(resolve(workspaceArg ?? process.cwd()));
	if (!flag('watch')) {
		process.stdout.write(`${await view(root)}\n`);
		return;
	}
	let last = '';
	const draw = async (): Promise<void> => {
		const next = await view(root);
		// Redraw only what changed, so the terminal does not flicker.
		if (next === last) return;
		last = next;
		process.stdout.write(`\u001b[2J\u001b[H${next}\n`);
	};
	await draw();
	const timer = setInterval(() => void draw(), WATCH_INTERVAL_MS);
	process.on('SIGINT', () => {
		clearInterval(timer);
		process.exit(0);
	});
};

await main();
