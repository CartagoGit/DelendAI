import type {
	IssueClassification,
	SafeFailureClass,
} from './reporter.interface';
import type { ISafeMcpFrame } from './safe-frame.interface';

export interface ISafeFingerprintInput {
	readonly packageId: string;
	readonly toolId?: string | undefined;
	readonly errorCode?: string | undefined;
	readonly failureClass: SafeFailureClass;
	readonly classification: IssueClassification;
	readonly mcpFrames: readonly ISafeMcpFrame[];
}
