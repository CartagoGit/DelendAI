export type ConfigurationPathSegment = string | number;

export type ConfigurationEdit =
	| {
			readonly action: 'set';
			readonly path: readonly ConfigurationPathSegment[];
			readonly value: unknown;
	  }
	| {
			readonly action: 'delete';
			readonly path: readonly ConfigurationPathSegment[];
	  };

export interface IConfigurationDocumentInput {
	readonly workspaceRoot: string;
	readonly configFileName?: string;
}

export interface IConfigurationDocumentSnapshot {
	readonly configFile: string;
	readonly exists: boolean;
	/** SHA-256 of the exact bytes read; absent files hash the empty string. */
	readonly digest: string;
	/** Secret-redacted JSON value suitable for display. */
	readonly value: Readonly<Record<string, unknown>>;
	readonly redactions: number;
}

export interface ISaveConfigurationDocumentInput
	extends IConfigurationDocumentInput {
	/** Digest returned by the read that the edit was based on. */
	readonly expectedDigest: string;
	readonly edits: readonly ConfigurationEdit[];
}

export interface IConfigurationValidationIssue {
	readonly path: readonly ConfigurationPathSegment[];
	readonly message: string;
}

export type SaveConfigurationDocumentResult =
	| {
			readonly ok: true;
			readonly changed: boolean;
			readonly document: IConfigurationDocumentSnapshot;
	  }
	| {
			readonly ok: false;
			readonly reason: 'conflict';
			readonly expectedDigest: string;
			readonly document: IConfigurationDocumentSnapshot;
	  }
	| {
			readonly ok: false;
			readonly reason: 'validation' | 'secret';
			readonly issues: readonly IConfigurationValidationIssue[];
			readonly document: IConfigurationDocumentSnapshot;
	  };
