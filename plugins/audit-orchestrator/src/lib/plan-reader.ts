import {
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	type IWorkspacePathProvider,
} from '@delendai/core/public';

import type {
	IAuditPlanChild,
	IAuditPlanDocument,
	IAuditPlanSlice,
} from './contracts';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/u;
const KEY_RE = /^[a-zA-Z-]+$/u;
const SLICE_HEADING_RE = /^###\s+(\S+)\s+[—-]\s+(?:Fix|Implement|Task):(.*)$/u;
const FILE_RE = /`([^`]+)`/u;

/**
 * Split `key: value` at the FIRST colon rather than matching the line.
 *
 * The three patterns this replaced (`^([a-zA-Z-]+):\s*(.*)$` and the two
 * below it) each put a `\s*` next to something that also matches
 * whitespace, which is polynomial backtracking on a long run of spaces —
 * and a plan document is a file, not an enum: anything the workspace
 * contains can reach here. Scanning for the colon once is linear, and
 * the key is then tested on a slice that cannot contain one.
 */
const splitKeyValue = (
	line: string,
): { readonly key: string; readonly value: string } | null => {
	const colon = line.indexOf(':');
	if (colon <= 0) return null;
	const key = line.slice(0, colon).trimEnd();
	if (!KEY_RE.test(key)) return null;
	return { key, value: line.slice(colon + 1).trim() };
};

const scalar = (frontmatter: string, key: string): string | undefined => {
	for (const line of frontmatter.split('\n')) {
		const pair = splitKeyValue(line.trim());
		if (pair?.key === key) return pair.value;
	}
	return undefined;
};

const parseChildren = (frontmatter: string): readonly IAuditPlanChild[] => {
	const start = frontmatter.indexOf('proposals:');
	if (start < 0) return [];
	const section = frontmatter.slice(start);
	const children: IAuditPlanChild[] = [];
	for (const line of section.split('\n').slice(1)) {
		if (!line.startsWith('        - id:')) continue;
		// `- id: <id>` with an optional `# title` comment, read by hand
		// for the same reason as `splitKeyValue`.
		const pair = splitKeyValue(line.trim().replace(/^-\s*/u, ''));
		if (pair?.key !== 'id' || pair.value.length === 0) continue;
		const hash = pair.value.indexOf('#');
		const id = (
			hash === -1 ? pair.value : pair.value.slice(0, hash)
		).trim();
		if (id.length === 0) continue;
		const title = hash === -1 ? '' : pair.value.slice(hash + 1).trim();
		children.push({
			id,
			...(title.length > 0 ? { title } : {}),
		});
	}
	return children;
};

const parseSlices = (body: string): readonly IAuditPlanSlice[] => {
	const lines = body.split('\n');
	const slices: IAuditPlanSlice[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const heading = SLICE_HEADING_RE.exec(lines[index] ?? '');
		if (!heading?.[1] || !heading[2]?.trim()) continue;
		const section: string[] = [];
		for (let next = index + 1; next < lines.length; next += 1) {
			if (
				/^###\s+/u.test(lines[next] ?? '') ||
				/^##\s+/u.test(lines[next] ?? '')
			)
				break;
			section.push(lines[next] ?? '');
		}
		const files = section
			.flatMap((line) => {
				const match = FILE_RE.exec(line);
				return match?.[1] && !line.includes('**Acceptance**')
					? [match[1]]
					: [];
			})
			.filter((file, position, all) => all.indexOf(file) === position);
		const instruction = section
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('- **Files'))
			.join(' ');
		slices.push({
			id: heading[1],
			title: heading[2].trim(),
			files,
			instruction: instruction || `Implement ${heading[2].trim()}.`,
		});
	}
	return slices;
};

export const parseAuditPlan = (markdown: string): IAuditPlanDocument => {
	const frontmatter = FRONTMATTER_RE.exec(markdown)?.[1] ?? '';
	const body = markdown.replace(FRONTMATTER_RE, '').trim();
	const id = scalar(frontmatter, 'id');
	const type = scalar(frontmatter, 'type');
	const title = scalar(frontmatter, 'title');
	if (!id || type !== 'plan' || !title) {
		throw new Error('audit plan must declare id, type: plan, and title');
	}
	return {
		id,
		title,
		type,
		...(scalar(frontmatter, 'status')
			? { status: scalar(frontmatter, 'status') }
			: {}),
		...(scalar(frontmatter, 'kind')
			? { kind: scalar(frontmatter, 'kind') }
			: {}),
		children: parseChildren(frontmatter),
		slices: parseSlices(body),
	};
};

export const readAuditPlan = async (
	workspace: IWorkspacePathProvider,
	relativePath: string,
): Promise<IAuditPlanDocument> => {
	const contained = resolveWorkspaceContained(workspace.root, relativePath);
	if (!contained.ok)
		throw new Error(contained.reason ?? 'plan path is outside workspace');
	const reader = new SafeWorkspaceReader(workspace.root);
	const relative = relativePath.replace(/^\.\//u, '');
	return parseAuditPlan((await reader.readText(relative)).content);
};

export const deriveAuditTasks = (
	plan: IAuditPlanDocument,
): readonly import('./contracts').IAuditTask[] => {
	const slices =
		plan.slices.length > 0
			? plan.slices
			: plan.children.map((child) => ({
					id: child.id,
					title: child.title ?? child.id,
					files: [],
					instruction: `Implement proposal ${child.id}: ${child.title ?? child.id}.`,
				}));
	return slices.map((slice, index) => ({
		id: `${plan.id}-${slice.id}`,
		title: slice.title,
		description: `${slice.instruction}\nPlan: ${plan.id}.`,
		files: slice.files,
		dependsOn: index > 0 ? [`${plan.id}-${slices[index - 1]?.id}`] : [],
	}));
};
