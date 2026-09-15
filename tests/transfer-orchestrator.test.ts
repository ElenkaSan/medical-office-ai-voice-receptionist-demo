import { describe, expect, it } from 'vitest';
import { MockTelephonyProvider } from '../src/adapters/telephony-provider.js';
import { VoiceSessionManager } from '../src/session-manager.js';
import { TransferOrchestrator } from '../src/transfer-orchestrator.js';

function readySession(sessions: VoiceSessionManager): string {
  const session = sessions.createSession('demo-caller');
  sessions.markConnected(session.sessionId);
  sessions.markListening(session.sessionId);
  return session.sessionId;
}

describe('TransferOrchestrator', () => {
  it('completes a successful staff transfer', async () => {
    const sessions = new VoiceSessionManager();
    const telephony = new MockTelephonyProvider();
    const orchestrator = new TransferOrchestrator(sessions, telephony);
    const sessionId = readySession(sessions);

    const result = await orchestrator.transferToStaff(
      sessionId,
      'front_desk',
      'Caller asked to speak with staff'
    );

    expect(result.success).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.providerReference).toMatch(/^mock-xfer-/);
    expect(sessions.getSession(sessionId).status).toBe('COMPLETED');
    expect(sessions.getSession(sessionId).transferCompleted).toBe(true);
  });

  it('ignores duplicate transfer requests for the same session', async () => {
    const sessions = new VoiceSessionManager();
    const telephony = new MockTelephonyProvider();
    const orchestrator = new TransferOrchestrator(sessions, telephony);
    const sessionId = readySession(sessions);

    const first = await orchestrator.transferToStaff(sessionId, 'front_desk', 'first request');
    const second = await orchestrator.transferToStaff(sessionId, 'front_desk', 'duplicate request');

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.providerReference).toBe(first.providerReference);
    expect(second.message).toContain('Duplicate transfer ignored');
  });

  it('uses fallback when primary telephony transfer fails', async () => {
    const sessions = new VoiceSessionManager();
    const telephony = new MockTelephonyProvider({
      failingDestinations: ['front_desk']
    });
    const orchestrator = new TransferOrchestrator(sessions, telephony, {
      fallbackDestination: 'after_hours_message'
    });
    const sessionId = readySession(sessions);

    const result = await orchestrator.transferToStaff(
      sessionId,
      'front_desk',
      'Need staff assistance'
    );

    expect(result.success).toBe(true);
    expect(result.usedFallback).toBe(true);
    expect(result.destination).toBe('after_hours_message');
    expect(result.message).toContain('used fallback');
    expect(sessions.getSession(sessionId).status).toBe('COMPLETED');
  });
});
