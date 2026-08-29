import {
	SafeWorkspaceReader,
	resolveWorkspaceContained,
	type IWorkspacePathProvider,
} from '@mcp-vertex/core/public';

import type {
	IAuditPlanChild,
	IAuditPlanDocument,
	IAuditPlanSlice,
} from './contracts';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/u;
const VALUE_RE = /^([a-zA-Z-]+):\s*(.*)$/u;
const CHILD_RE = /^\s*-\s*id:\s*([^\s#]+)(?:\s+#\s*(.*))?$/u;
const SLICE_RE = /^###\s+([^\s]+)\s+[—-]\s+(?:Fix|Implement|Task):\s*(.+)$/u;
const FILE_RE = /`([^`]+)`/u;

const scalar = (frontmatter: string, key: string): string | undefined => {
	for (const line of frontmatter.split('\n')) {
		const match = VALUE_RE.exec(line.trim());
		if (match?.[1] === key) return match[2]?.trim();
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
		const match = CHILD_RE.exec(line);
		if (match?.[1] === undefined) continue;
		children.push({
			id: match[1],
			...(match[2] ? { title: match[2] } : {}),
		});
	}
	return children;
};

const parseSlices = (body: string): readonly IAuditPlanSlice[] => {
	const lines = body.split('\n');
	const slices: IAuditPlanSlice[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const heading = SLICE_RE.exec(lines[index] ?? '');
		if (!heading?.[1] || !heading[2]) continue;
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
