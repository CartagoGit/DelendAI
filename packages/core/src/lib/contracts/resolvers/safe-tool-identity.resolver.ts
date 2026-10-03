import type {
	ISafeToolIdentity,
	IToolIdentityRegistry,
	SafeToolId,
} from '../interfaces/safe-tool-identity.interface';

const asSafeToolId = (value: string): SafeToolId => value as SafeToolId;

export const resolvePublicToolIdentity = (
	toolName: string,
	registry: Pick<IToolIdentityRegistry, 'get'>,
): ISafeToolIdentity => {
	const entry = registry.get(toolName);
	if (
		entry === undefined ||
		entry === null ||
		typeof entry !== 'object' ||
		!('packageName' in entry) ||
		typeof entry.packageName !== 'string'
	) {
		return {
			owner: 'host-project',
			category: 'unknown',
		};
	}

	if (entry.packageName.startsWith('@delendai/')) {
		return {
			owner: 'delendai',
			safeToolId: asSafeToolId(
				`${entry.packageName}.${entry.publicToolName ?? toolName}`,
			),
			category: entry.category ?? 'unknown',
		};
	}

	return {
		owner: entry.owner,
		category: entry.category ?? 'unknown',
	};
};
