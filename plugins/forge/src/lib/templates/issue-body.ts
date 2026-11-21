export interface IRenderIssueBodyInput {
	readonly title: string;
	readonly description?: string | undefined;
	readonly proposalId?: string | undefined;
	readonly labels?: readonly string[] | undefined;
}

export const renderIssueBody = (input: IRenderIssueBodyInput): string => {
	const labels =
		input.labels?.filter((label) => label.trim().length > 0) ?? [];
	const sections = [
		`# ${input.title.trim()}`,
		'',
		input.description?.trim() || 'No additional context provided.',
		'',
		'## Metadata',
		`- Linked proposal: ${input.proposalId?.trim() || 'none linked'}`,
		`- Labels: ${labels.length > 0 ? labels.join(', ') : 'none'}`,
	];
	return `${sections.join('\n').trim()}\n`;
};
