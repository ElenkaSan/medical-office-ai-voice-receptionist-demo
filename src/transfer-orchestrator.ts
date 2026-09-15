import type { TelephonyProvider } from './adapters/telephony-provider.js';
import {
  InvalidSessionTransitionError,
  VoiceSessionManager
} from './session-manager.js';
import type { TransferDestination, TransferResult } from './types.js';

export interface TransferOrchestratorOptions {
  /** Fallback destination used when the primary telephony path fails. */
  fallbackDestination?: TransferDestination;
}

/**
 * Coordinates AI-requested handoff into telephony transfer.
 * Production systems also correlate media-room identity with PBX call-leg IDs.
 */
export class TransferOrchestrator {
  private readonly inFlight = new Set<string>();
  private readonly completed = new Map<string, TransferResult>();
  private readonly fallbackDestination: TransferDestination;

  constructor(
    private readonly sessions: VoiceSessionManager,
    private readonly telephony: TelephonyProvider,
    options: TransferOrchestratorOptions = {}
  ) {
    this.fallbackDestination = options.fallbackDestination ?? 'after_hours_message';
  }

  async transferToStaff(
    sessionId: string,
    destination: TransferDestination,
    reason: string
  ): Promise<TransferResult> {
    const existing = this.completed.get(sessionId);
    if (existing) {
      return {
        ...existing,
        message: `Duplicate transfer ignored; previous result: ${existing.message}`
      };
    }

    if (this.inFlight.has(sessionId)) {
      return {
        sessionId,
        success: false,
        destination,
        providerReference: null,
        usedFallback: false,
        message: 'Transfer already in progress for this session'
      };
    }

    this.inFlight.add(sessionId);

    try {
      this.sessions.markTransferring(sessionId, destination);

      const primary = await this.telephony.transfer({
        sessionId,
        destination,
        reason
      });

      if (primary.success) {
        this.sessions.markTransferCompleted(sessionId);
        this.completed.set(sessionId, primary);
        return primary;
      }

      const fallback = await this.telephony.transfer({
        sessionId,
        destination: this.fallbackDestination,
        reason: `Fallback after primary failure: ${primary.message}`
      });

      const result: TransferResult = {
        ...fallback,
        usedFallback: true,
        message: fallback.success
          ? `Primary transfer failed; used fallback (${this.fallbackDestination})`
          : `Primary and fallback transfers failed: ${fallback.message}`
      };

      if (result.success) {
        this.sessions.markTransferCompleted(sessionId);
      } else {
        this.sessions.fail(sessionId, result.message);
      }

      this.completed.set(sessionId, result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transfer error';
      if (!(error instanceof InvalidSessionTransitionError)) {
        try {
          this.sessions.fail(sessionId, message);
        } catch {
          // Session may already be terminal.
        }
      }
      const failed: TransferResult = {
        sessionId,
        success: false,
        destination,
        providerReference: null,
        usedFallback: false,
        message
      };
      this.completed.set(sessionId, failed);
      return failed;
    } finally {
      this.inFlight.delete(sessionId);
    }
  }
}
