const isContinuationByte = (byte: number): boolean =>
	(byte & 0b1100_0000) === 0b1000_0000;

const sequenceLengthFromLeadByte = (byte: number): number => {
	if ((byte & 0b1000_0000) === 0) return 1;
	if ((byte & 0b1110_0000) === 0b1100_0000) return 2;
	if ((byte & 0b1111_0000) === 0b1110_0000) return 3;
	if ((byte & 0b1111_1000) === 0b1111_0000) return 4;
	return 1;
};

const trimIncompleteUtf8Tail = (buffer: Buffer): Buffer => {
	if (buffer.length === 0) return buffer;
	let continuationBytes = 0;
	for (
		let index = buffer.length - 1;
		index >= 0 && isContinuationByte(buffer[index]!);
		index -= 1
	) {
		continuationBytes += 1;
	}
	const leadIndex = buffer.length - 1 - continuationBytes;
	if (leadIndex < 0) return Buffer.alloc(0);
	const expectedLength = sequenceLengthFromLeadByte(buffer[leadIndex]!);
	return expectedLength > continuationBytes + 1
		? buffer.subarray(0, leadIndex)
		: buffer;
};

export const truncateUtf8Buffer = (input: Buffer, maxBytes: number): Buffer => {
	if (maxBytes < 0) {
		throw new RangeError('maxBytes must be non-negative');
	}
	if (maxBytes === 0) return Buffer.alloc(0);
	if (input.length <= maxBytes) {
		return trimIncompleteUtf8Tail(input);
	}
	return trimIncompleteUtf8Tail(input.subarray(0, maxBytes));
};
