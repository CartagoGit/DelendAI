import { resolveExistingWorkspaceContained } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import type { IWorkspacePathProvider } from '@delendai/core/contracts';

import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Document } from 'yaml';

import type {
	IAuditPlanChild,
	IAuditPlanDocument,
	IAuditPlanSlice,
} from './contracts';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/u;
const SLICE_HEADING_RE = /^###\s+(\S+)\s+[—-]\s+(?:Fix|Implement|Task):(.*)$/u;
const FILE_RE = /`([^`]+)`/u;

const parseFrontmatter = (frontmatter: string): Document => {
	const document = parseDocument(frontmatter);
	if (document.errors.length > 0) {
		throw new Error(
			`audit plan frontmatter is not valid YAML: ${document.errors[0]?.message ?? 'unknown error'}`,
		);
	}
	return document;
};

const scalar = (document: Document, key: string): string | undefined => {
	const value: unknown = document.get(key);
	if (typeof value === 'string') return value.trim() || undefined;
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return undefined;
};

const childOf = (item: unknown): IAuditPlanChild | undefined => {
	if (!isMap(item)) return undefined;
	const idNode: unknown = item.get('id', true);
	if (!isScalar(idNode) || typeof idNode.value !== 'string') return undefined;
	const id = idNode.value.trim();
	if (id.length === 0) return undefined;
	const declared: unknown = item.get('title');
	const comment = idNode.comment?.trim() ?? '';
	const title =
		typeof declared === 'string' && declared.trim().length > 0
			? declared.trim()
			: comment;
	return { id, ...(title.length > 0 ? { title } : {}) };
};

/**
 * `contains.proposals` read as YAML, so block lists, flow maps
 * (`- { id: x1, kind: fix }`) and any indentation parse alike.
 */
const parseChildren = (document: Document): readonly IAuditPlanChild[] => {
	const proposals: unknown = document.getIn(['contains', 'proposals'], true);
	if (!isSeq(proposals)) return [];
	return proposals.items.flatMap((item) => {
		const child = childOf(item);
		return child === undefined ? [] : [child];
	});
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
	const document = parseFrontmatter(FRONTMATTER_RE.exec(markdown)?.[1] ?? '');
	const body = markdown.replace(FRONTMATTER_RE, '').trim();
	const id = scalar(document, 'id');
	const type = scalar(document, 'type');
	const title = scalar(document, 'title');
	if (!id || type !== 'plan' || !title) {
		throw new Error('audit plan must declare id, type: plan, and title');
	}
	return {
		id,
		title,
		type,
		...(scalar(document, 'status')
			? { status: scalar(document, 'status') }
			: {}),
		...(scalar(document, 'kind') ? { kind: scalar(document, 'kind') } : {}),
		children: parseChildren(document),
		slices: parseSlices(body),
	};
};

export const readAuditPlan = async (
	workspace: IWorkspacePathProvider,
	relativePath: string,
): Promise<IAuditPlanDocument> => {
	const contained = await resolveExistingWorkspaceContained(
		workspace.root,
		relativePath,
	);
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
