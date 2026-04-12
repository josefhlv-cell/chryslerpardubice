// ISO-TP (ISO 15765-2) Transport Layer
// Multi-frame support, buffer assembly, frame type detection

export enum FrameType {
  SINGLE = 0,
  FIRST = 1,
  CONSECUTIVE = 2,
  FLOW_CONTROL = 3,
}

export type ISOTPFrame = {
  type: FrameType;
  data: number[];
  sequenceNumber?: number;
  totalLength?: number;
  blockSize?: number;
  separationTime?: number;
};

export type AssemblyBuffer = {
  totalLength: number;
  receivedLength: number;
  data: number[];
  expectedSequence: number;
  complete: boolean;
  startTime: number;
};

class ISOTPTransport {
  private assemblyBuffers: Map<string, AssemblyBuffer> = new Map();
  private readonly TIMEOUT = 5000;

  detectFrameType(byte0: number): FrameType {
    const nibble = (byte0 >> 4) & 0x0F;
    switch (nibble) {
      case 0: return FrameType.SINGLE;
      case 1: return FrameType.FIRST;
      case 2: return FrameType.CONSECUTIVE;
      case 3: return FrameType.FLOW_CONTROL;
      default: return FrameType.SINGLE;
    }
  }

  parseFrame(hexData: string): ISOTPFrame | null {
    const bytes = this.hexToBytes(hexData);
    if (bytes.length === 0) return null;

    const frameType = this.detectFrameType(bytes[0]);

    switch (frameType) {
      case FrameType.SINGLE: {
        const length = bytes[0] & 0x0F;
        return {
          type: FrameType.SINGLE,
          data: bytes.slice(1, 1 + length),
        };
      }
      case FrameType.FIRST: {
        const totalLength = ((bytes[0] & 0x0F) << 8) | bytes[1];
        return {
          type: FrameType.FIRST,
          data: bytes.slice(2),
          totalLength,
        };
      }
      case FrameType.CONSECUTIVE: {
        const seqNum = bytes[0] & 0x0F;
        return {
          type: FrameType.CONSECUTIVE,
          data: bytes.slice(1),
          sequenceNumber: seqNum,
        };
      }
      case FrameType.FLOW_CONTROL: {
        return {
          type: FrameType.FLOW_CONTROL,
          data: [],
          blockSize: bytes[1],
          separationTime: bytes[2],
        };
      }
    }
  }

  processResponse(source: string, hexData: string): { complete: boolean; data: number[] } {
    const frame = this.parseFrame(hexData);
    if (!frame) return { complete: false, data: [] };

    switch (frame.type) {
      case FrameType.SINGLE:
        return { complete: true, data: frame.data };

      case FrameType.FIRST: {
        const buffer: AssemblyBuffer = {
          totalLength: frame.totalLength!,
          receivedLength: frame.data.length,
          data: [...frame.data],
          expectedSequence: 1,
          complete: false,
          startTime: Date.now(),
        };
        this.assemblyBuffers.set(source, buffer);
        return { complete: false, data: [] };
      }

      case FrameType.CONSECUTIVE: {
        const buffer = this.assemblyBuffers.get(source);
        if (!buffer) return { complete: false, data: [] };

        if (Date.now() - buffer.startTime > this.TIMEOUT) {
          this.assemblyBuffers.delete(source);
          return { complete: false, data: [] };
        }

        if (frame.sequenceNumber === buffer.expectedSequence) {
          const remaining = buffer.totalLength - buffer.receivedLength;
          const toAdd = Math.min(frame.data.length, remaining);
          buffer.data.push(...frame.data.slice(0, toAdd));
          buffer.receivedLength += toAdd;
          buffer.expectedSequence = (buffer.expectedSequence + 1) & 0x0F;

          if (buffer.receivedLength >= buffer.totalLength) {
            buffer.complete = true;
            this.assemblyBuffers.delete(source);
            return { complete: true, data: buffer.data };
          }
        }

        return { complete: false, data: [] };
      }

      default:
        return { complete: false, data: [] };
    }
  }

  createFlowControl(blockSize = 0, separationTime = 0): string {
    return this.bytesToHex([0x30, blockSize, separationTime, 0, 0, 0, 0, 0]);
  }

  hexToBytes(hex: string): number[] {
    const clean = hex.replace(/\s/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.substring(i, i + 2), 16));
    }
    return bytes;
  }

  bytesToHex(bytes: number[]): string {
    return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  }

  clearBuffers() {
    this.assemblyBuffers.clear();
  }
}

export const isotpTransport = new ISOTPTransport();
