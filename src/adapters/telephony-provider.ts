import type { TransferDestination, TransferRequest, TransferResult } from '../types.js';

export interface TelephonyProvider {
  readonly name: string;
  transfer(request: TransferRequest): Promise<TransferResult>;
}

export interface MockTelephonyOptions {
  /**
   * Destinations that should fail on the primary attempt.
   * Useful for demonstrating orchestrator fallback without real PBX credentials.
   */
  failingDestinations?: TransferDestination[];
}

/**
 * Offline telephony adapter.
 * Production adapters would call a PBX / CPaaS transfer API and correlate call legs.
 */
export class MockTelephonyProvider implements TelephonyProvider {
  readonly name = 'mock-telephony';
  private readonly failingDestinations: ReadonlySet<TransferDestination>;
  private sequence = 0;

  constructor(options: MockTelephonyOptions = {}) {
    this.failingDestinations = new Set(options.failingDestinations ?? []);
  }

  async transfer(request: TransferRequest): Promise<TransferResult> {
    this.sequence += 1;
    const providerReference = `mock-xfer-${this.sequence.toString().padStart(4, '0')}`;

    if (this.failingDestinations.has(request.destination)) {
      return {
        sessionId: request.sessionId,
        success: false,
        destination: request.destination,
        providerReference: null,
        usedFallback: false,
        message: `Primary telephony transfer failed for destination ${request.destination}`
      };
    }

    return {
      sessionId: request.sessionId,
      success: true,
      destination: request.destination,
      providerReference,
      usedFallback: false,
      message: `Transferred to ${formatDestination(request.destination)}`
    };
  }
}

function formatDestination(destination: TransferDestination): string {
  switch (destination) {
    case 'front_desk':
      return 'front desk queue';
    case 'clinical_callback_queue':
      return 'clinical callback queue';
    case 'after_hours_message':
      return 'after-hours message path';
  }
}
