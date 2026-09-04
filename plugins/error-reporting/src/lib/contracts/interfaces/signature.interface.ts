import type {
	IssueClassification,
	SafeFailureClass,
} from './reporter.interface';
import type { DelendaiErrorCode } from '../constants/error-codes.constant';
import type { ISafeMcpFrame } from './safe-frame.interface';

export interface ISafeFingerprintInput {
	readonly delendaiVersion: string;
	readonly packageId: string;
	readonly componentId?: string | undefined;
	readonly toolId?: string | undefined;
	readonly errorCode?: DelendaiErrorCode | undefined;
	readonly failureClass: SafeFailureClass;
	readonly classification: IssueClassification;
	readonly mcpFrames: readonly ISafeMcpFrame[];
}
