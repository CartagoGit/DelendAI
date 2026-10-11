/**
 * tools.fixture.ts — a throwaway project with a roadmap, and a way to
 * call a tool as a host would.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { IToolRegistration } from '@delendai/core/contracts';

import type {
	IRoadmapOptions,
	IRoadmapToolOptions,
} from '../../../../src/lib/contracts/interfaces/roadmap-workspace.interface';
import type { IRoadmap } from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import { openRoadmapWorkspace } from '../../../../src/lib/workspace/roadmap-workspace.service';

const projects: string[] = [];

export const cleanProjects = (): void => {
	for (const dir of projects.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
};

export interface IRoadmapProject {
	readonly root: string;
	readonly options: IRoadmapToolOptions;
	/** Writes a workspace-relative file, creating its directories. */
	readonly write: (path: string, content: string) => void;
}

/** A project whose roadmap file holds `roadmap` (no file when absent). */
export const roadmapProject = (
	roadmap?: IRoadmap,
	extra: Partial<IRoadmapOptions> = {},
	branches: IRoadmapToolOptions['branches'] = {
		integration: 'trunk',
		release: 'release/2.x',
	},
): IRoadmapProject => {
	const root = mkdtempSync(join(tmpdir(), 'roadmap-tools-'));
	projects.push(root);
	const write = (path: string, content: string): void => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	};
	if (roadmap !== undefined) {
		write('ROADMAP.yaml', `${JSON.stringify(roadmap, null, '\t')}\n`);
	}
	const opened = openRoadmapWorkspace({
		workspaceRoot: root,
		docsDir: join(root, 'docs'),
		options: { ...extra, file: 'ROADMAP.yaml' },
	});
	if (!opened.ok) throw new Error(opened.reason);
	return {
		root,
		write,
		options: {
			namespacePrefix: 'x',
			workspace: () => opened.value,
			now: () => '2026-10-11T00:00:00.000Z',
			...(branches === undefined ? {} : { branches }),
		},
	};
};

export interface IToolAnswer {
	readonly name: string;
	readonly isError: boolean;
	readonly body: Record<string, unknown>;
	readonly outputSchema: unknown;
}

/** Registers `tool` on a stand-in server and calls it with `args`. */
export const call = async (
	tool: IToolRegistration,
	args: unknown = {},
): Promise<IToolAnswer> => {
	let name = '';
	let meta: Record<string, unknown> = {};
	let handler: ((input: unknown) => Promise<unknown>) | undefined;
	await tool.register({
		registerTool: (
			registered: string,
			registeredMeta: Record<string, unknown>,
			fn: (input: unknown) => Promise<unknown>,
		) => {
			name = registered;
			meta = registeredMeta;
			handler = fn;
			return { dispose: () => undefined };
		},
	} as never);
	if (handler === undefined) throw new Error(`${tool.id} registered nothing`);
	const result = (await handler(args)) as {
		readonly content: readonly { readonly text: string }[];
		readonly isError?: boolean;
	};
	return {
		name,
		isError: result.isError === true,
		body: JSON.parse(result.content[0]?.text ?? '{}') as Record<
			string,
			unknown
		>,
		outputSchema: meta.outputSchema,
	};
};

/** The reason an error envelope gives. */
export const reasonOf = (answer: IToolAnswer): string =>
	String((answer.body.error as { reason?: unknown } | undefined)?.reason);

/** The code an error envelope gives. */
export const codeOf = (answer: IToolAnswer): string =>
	String((answer.body.error as { code?: unknown } | undefined)?.code);
