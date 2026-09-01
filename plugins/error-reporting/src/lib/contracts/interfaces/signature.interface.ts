import type {
	IssueClassification,
	SafeFailureClass,
} from './reporter.interface';
import type { McpVertexErrorCode } from '../constants/error-codes.constant';
import type { ISafeMcpFrame } from './safe-frame.interface';

export interface ISafeFingerprintInput {
	readonly mcpVertexVersion: string;
	readonly packageId: string;
	readonly componentId?: string | undefined;
	readonly toolId?: string | undefined;
	readonly errorCode?: McpVertexErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
	readonly classification: IssueClassification;
	readonly mcpFrames: readonly ISafeMcpFrame[];
}
