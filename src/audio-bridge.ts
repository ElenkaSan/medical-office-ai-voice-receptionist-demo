import type { RealtimeProvider } from './adapters/realtime-provider.js';
import type { AudioFrame, BridgeState } from './types.js';

export interface AudioBridgeOptions {
  /** Demo sample rate for published frames. Production bridges often convert between media and model rates. */
  publishSampleRateHz?: number;
}

/**
 * Conceptual bidirectional audio path between a media room and a realtime model.
 *
 * Production voice systems typically must also handle:
 * - sample-rate conversion (e.g. WebRTC/PSTN rates ↔ model PCM rates)
 * - network jitter and clock drift
 * - late media track attachment after session start
 * - interruption policy so barge-in does not chop every reply
 * - deterministic shutdown so tracks and sockets do not leak
 */
export class AudioBridge {
  private state: BridgeState = 'idle';
  private readonly inboundBuffer: AudioFrame[] = [];
  private readonly outboundBuffer: AudioFrame[] = [];
  private interrupted = false;
  private readonly publishSampleRateHz: number;

  constructor(
    private readonly sessionId: string,
    private readonly realtime: RealtimeProvider,
    options: AudioBridgeOptions = {}
  ) {
    this.publishSampleRateHz = options.publishSampleRateHz ?? 24_000;
  }

  getStatus(): {
    sessionId: string;
    state: BridgeState;
    interrupted: boolean;
    inboundBufferedFrames: number;
    outboundBufferedFrames: number;
    publishSampleRateHz: number;
  } {
    return {
      sessionId: this.sessionId,
      state: this.state,
      interrupted: this.interrupted,
      inboundBufferedFrames: this.inboundBuffer.length,
      outboundBufferedFrames: this.outboundBuffer.length,
      publishSampleRateHz: this.publishSampleRateHz
    };
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') {
      throw new Error(`Audio bridge for ${this.sessionId} is already stopped`);
    }
    await this.realtime.connect(this.sessionId);
    this.state = 'bridging';
    this.interrupted = false;
  }

  async pushInbound(frame: AudioFrame): Promise<void> {
    this.assertBridging();
    if (this.interrupted) {
      return;
    }
    this.inboundBuffer.push(frame);
    await this.realtime.appendInboundAudio(this.sessionId, frame);

    const outbound = await this.realtime.pullOutboundAudio(this.sessionId);
    if (outbound) {
      this.outboundBuffer.push({
        ...outbound,
        sampleRateHz: this.publishSampleRateHz
      });
    }
  }

  pullOutbound(): AudioFrame | null {
    return this.outboundBuffer.shift() ?? null;
  }

  async requestBargeIn(): Promise<void> {
    this.assertBridging();
    // Demo policy: clear pending playback and signal the model path.
    // Production systems often debounce false VAD triggers and protect scripted greetings.
    this.interrupted = true;
    this.state = 'interrupted';
    this.outboundBuffer.length = 0;
    await this.realtime.signalInterruption(this.sessionId);
  }

  resumeAfterBargeIn(): void {
    if (this.state === 'stopped') {
      throw new Error(`Audio bridge for ${this.sessionId} is already stopped`);
    }
    this.interrupted = false;
    this.state = 'bridging';
  }

  async stop(): Promise<void> {
    this.inboundBuffer.length = 0;
    this.outboundBuffer.length = 0;
    this.interrupted = false;
    this.state = 'stopped';
    await this.realtime.disconnect(this.sessionId);
  }

  private assertBridging(): void {
    if (this.state !== 'bridging' && this.state !== 'interrupted') {
      throw new Error(`Audio bridge for ${this.sessionId} is not active (state=${this.state})`);
    }
  }
}
