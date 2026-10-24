/**
 * roadmap-workspace.service.ts — a project's roadmap, opened from what
 * the project declares. Every path it is given is resolved inside the
 * workspace — where it really is, symlinks followed — or refused; nothing here knows a branch, a file name or a
 * directory layout of its own.
 */
// effect-boundary-authorized: read-only probes (does a path exist, which
// folder holds a proposal, what a version file says) for the gate
// evidence; every write goes through the injected IRoadmapFilePort.
import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

import {
	resolveWorkspaceContainedEffective,
	SafeWorkspaceReader,
} from '@delendai/core/public';

import { TIMELINE_SUFFIX } from '../contracts/constants/timeline.constant';
import type { IRoadmapResult } from '../contracts/interfaces/roadmap.interface';
import type {
	IRoadmapWorkspace,
	IRoadmapWorkspaceInput,
} from '../contracts/interfaces/roadmap-workspace.interface';
import { MarkdownRoadmapStore } from '../store/markdown-roadmap.store';
import { MarkdownTimelineStore } from '../store/markdown-timeline.store';
import { createNodeRoadmapFilePort } from '../store/node-roadmap-file-port.service';

/** The directory, under the docs, that holds one folder per proposal status. */
const PROPOSALS_DIR = 'proposals';

/** `ROADMAP.md` → `ROADMAP.timeline.md`, beside it. */
export const timelineBeside = (file: string): string => {
	const extension = extname(file);
	return `${extension === '' ? file : file.slice(0, -extension.length)}${TIMELINE_SUFFIX}`;
};

/** The status folder of the proposal whose file starts with `<id>-`. */
const proposalStatusIn = async (
	docsDir: string,
	id: string,
): Promise<string | undefined> => {
	let entries: readonly string[];
	try {
		entries = await readdir(join(docsDir, PROPOSALS_DIR), {
			recursive: true,
		});
	} catch {
		return undefined;
	}
	const found = entries.find((entry) => {
		const name = entry.split(/[\\/]/u).at(-1) ?? '';
		return name.startsWith(`${id}-`) && name.endsWith('.md');
	});
	return found?.split(/[\\/]/u)[0];
};

export const openRoadmapWorkspace = async (
	input: IRoadmapWorkspaceInput,
): Promise<IRoadmapResult<IRoadmapWorkspace>> => {
	const { workspaceRoot, options } = input;
	const files = input.files ?? createNodeRoadmapFilePort();
	const reader = new SafeWorkspaceReader(workspaceRoot);
	const file = await resolveWorkspaceContainedEffective(
		workspaceRoot,
		options.file,
	);
	if (!file.ok) {
		return {
			ok: false,
			reason: `the roadmap file "${options.file}" is outside the workspace: ${file.reason}`,
		};
	}
	const timelineFile = options.timeline ?? timelineBeside(options.file);
	const timeline = await resolveWorkspaceContainedEffective(
		workspaceRoot,
		timelineFile,
	);
	if (!timeline.ok) {
		return {
			ok: false,
			reason: `the timeline file "${timelineFile}" is outside the workspace: ${timeline.reason}`,
		};
	}
	return {
		ok: true,
		value: {
			file: options.file,
			roadmap: new MarkdownRoadmapStore({ path: file.abs, files }),
			timeline: new MarkdownTimelineStore({ path: timeline.abs, files }),
			policy: {
				blockingGates: options.promotion?.blockingGates,
				deferralPolicy: options.promotion?.deferralPolicy,
			},
			pathExists: async (relativePath) => {
				const contained = await resolveWorkspaceContainedEffective(
					workspaceRoot,
					relativePath,
				);
				// A path outside the workspace is not this project's to
				// look at: no evidence, rather than "it does not exist".
				if (!contained.ok) return undefined;
				return (await reader.exists(relativePath)) !== null;
			},
			proposalStatus: (id) =>
				input.docsDir === undefined
					? Promise.resolve(undefined)
					: proposalStatusIn(input.docsDir, id),
			currentVersion: async () => {
				if (options.versionFile === undefined) return undefined;
				try {
					const parsed: unknown = JSON.parse(
						(await reader.readText(options.versionFile)).content,
					);
					const version = (parsed as { version?: unknown } | null)
						?.version;
					return typeof version === 'string' ? version : undefined;
				} catch {
					return undefined;
				}
			},
		},
	};
};
