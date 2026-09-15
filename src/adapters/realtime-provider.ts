import type { AudioFrame, BridgeState } from '../types.js';

export interface RealtimeProvider {
  readonly name: string;
  connect(sessionId: string): Promise<void>;
  appendInboundAudio(sessionId: string, frame: AudioFrame): Promise<void>;
  pullOutboundAudio(sessionId: string): Promise<AudioFrame | null>;
  signalInterruption(sessionId: string): Promise<void>;
  disconnect(sessionId: string): Promise<void>;
}

/**
 * Offline stand-in for a realtime speech model provider.
 * Production systems typically stream PCM to/from a vendor WebSocket API.
 */
export class MockRealtimeProvider implements RealtimeProvider {
  readonly name = 'mock-realtime';
  private readonly connected = new Set<string>();
  private readonly outboundQueues = new Map<string, AudioFrame[]>();

  async connect(sessionId: string): Promise<void> {
    this.connected.add(sessionId);
    this.outboundQueues.set(sessionId, []);
  }

  async appendInboundAudio(sessionId: string, frame: AudioFrame): Promise<void> {
    this.assertConnected(sessionId);
    // Echo a short synthetic reply frame to keep the bridge path demonstrable.
    const reply: AudioFrame = {
      trackId: `assistant-${frame.trackId}`,
      sampleRateHz: frame.sampleRateHz,
      channels: 1,
      pcm16: new Int16Array(frame.pcm16.length),
      capturedAtMs: Date.now()
    };
    this.outboundQueues.get(sessionId)?.push(reply);
  }

  async pullOutboundAudio(sessionId: string): Promise<AudioFrame | null> {
    this.assertConnected(sessionId);
    return this.outboundQueues.get(sessionId)?.shift() ?? null;
  }

  async signalInterruption(sessionId: string): Promise<void> {
    this.assertConnected(sessionId);
    this.outboundQueues.set(sessionId, []);
  }

  async disconnect(sessionId: string): Promise<void> {
    this.connected.delete(sessionId);
    this.outboundQueues.delete(sessionId);
  }

  private assertConnected(sessionId: string): void {
    if (!this.connected.has(sessionId)) {
      throw new Error(`Realtime provider is not connected for session ${sessionId}`);
    }
  }
}

export type { BridgeState };
