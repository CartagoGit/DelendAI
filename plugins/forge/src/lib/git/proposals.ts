import { readdir, readFile } from 'node:fs/promises';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/u;
const FIELD_RE = (field: string) =>
	new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'mu');

const collectMarkdownFiles = async (dir: string): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		const nextPath = `${dir}/${entry.name}`;
		if (entry.isDirectory()) {
			files.push(...(await collectMarkdownFiles(nextPath)));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith('.md')) {
			files.push(nextPath);
		}
	}
	return files;
};

const extractField = (content: string, field: string): string | undefined => {
	const frontmatter = content.match(FRONTMATTER_RE)?.[1];
	if (frontmatter === undefined) return undefined;
	return frontmatter.match(FIELD_RE(field))?.[1]?.trim();
};

const branchMatchesProposalId = (
	branch: string,
	proposalId: string,
): boolean => {
	const lowerBranch = branch.toLowerCase();
	const lowerId = proposalId.toLowerCase();
	return (
		lowerBranch === lowerId ||
		lowerBranch.startsWith(`${lowerId}-`) ||
		lowerBranch.startsWith(`${lowerId}/`) ||
		lowerBranch.includes(`-${lowerId}-`) ||
		lowerBranch.includes(`/${lowerId}/`) ||
		lowerBranch.includes(`-${lowerId}/`) ||
		lowerBranch.includes(`/${lowerId}-`) ||
		lowerBranch.endsWith(`-${lowerId}`) ||
		lowerBranch.endsWith(`/${lowerId}`)
	);
};

export const findLinkedProposalId = async (
	branch: string,
	cwd: string,
): Promise<string | undefined> => {
	const proposalRoot = `${cwd}/docs/delendai/proposals`;
	const files = await collectMarkdownFiles(proposalRoot);
	for (const filePath of files) {
		const content = await readFile(filePath, 'utf8').catch(() => undefined);
		if (content === undefined) continue;
		const linkedBranch = extractField(content, 'branch');
		if (linkedBranch?.trim() === branch.trim()) {
			return extractField(content, 'id');
		}
	}
	for (const filePath of files) {
		const content = await readFile(filePath, 'utf8').catch(() => undefined);
		if (content === undefined) continue;
		const proposalId = extractField(content, 'id');
		if (
			proposalId !== undefined &&
			branchMatchesProposalId(branch, proposalId)
		) {
			return proposalId;
		}
	}
	return undefined;
};
