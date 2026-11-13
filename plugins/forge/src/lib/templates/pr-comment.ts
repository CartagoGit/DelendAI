export interface IRenderPrCommentInput {
	readonly author?: string | undefined;
	readonly message: string;
	readonly context?: string | undefined;
}

export const renderPrComment = (input: IRenderPrCommentInput): string => {
	const lines = [
		`Author: ${(input.author?.trim() || 'agent').trim()}`,
		'',
		input.message.trim(),
	];
	if (input.context?.trim()) {
		lines.push('', `Context: ${input.context.trim()}`);
	}
	return `${lines.join('\n').trim()}\n`;
};
