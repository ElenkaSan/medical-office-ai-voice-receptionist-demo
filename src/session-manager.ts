import { randomUUID } from 'node:crypto';
import type { CallerIntent, SessionStatus, TransferDestination, VoiceSession } from './types.js';

const ALLOWED_TRANSITIONS: Record<SessionStatus, ReadonlySet<SessionStatus>> = {
  INITIALIZING: new Set(['CONNECTED', 'FAILED']),
  CONNECTED: new Set(['LISTENING', 'FAILED', 'COMPLETED']),
  LISTENING: new Set(['PROCESSING', 'TRANSFERRING', 'COMPLETED', 'FAILED']),
  PROCESSING: new Set(['LISTENING', 'TRANSFERRING', 'COMPLETED', 'FAILED']),
  TRANSFERRING: new Set(['COMPLETED', 'FAILED']),
  COMPLETED: new Set(),
  FAILED: new Set()
};

export class InvalidSessionTransitionError extends Error {
  constructor(
    readonly sessionId: string,
    readonly from: SessionStatus,
    readonly to: SessionStatus
  ) {
    super(`Invalid session transition for ${sessionId}: ${from} → ${to}`);
    this.name = 'InvalidSessionTransitionError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Owns call-session lifecycle and valid state transitions.
 * Production systems often persist this state and coordinate it with media rooms.
 */
export class VoiceSessionManager {
  private readonly sessions = new Map<string, VoiceSession>();

  createSession(callerLabel = 'demo-caller'): VoiceSession {
    const now = new Date().toISOString();
    const session: VoiceSession = {
      sessionId: `demo-${randomUUID()}`,
      status: 'INITIALIZING',
      createdAt: now,
      updatedAt: now,
      callerLabel,
      intent: null,
      transferRequested: false,
      transferCompleted: false,
      transferDestination: null,
      lastError: null
    };
    this.sessions.set(session.sessionId, session);
    return this.clone(session);
  }

  getSession(sessionId: string): VoiceSession {
    return this.clone(this.require(sessionId));
  }

  listSessions(): VoiceSession[] {
    return [...this.sessions.values()].map((session) => this.clone(session));
  }

  markConnected(sessionId: string): VoiceSession {
    return this.transition(sessionId, 'CONNECTED');
  }

  markListening(sessionId: string): VoiceSession {
    return this.transition(sessionId, 'LISTENING');
  }

  markProcessing(sessionId: string): VoiceSession {
    return this.transition(sessionId, 'PROCESSING');
  }

  setIntent(sessionId: string, intent: CallerIntent): VoiceSession {
    const session = this.require(sessionId);
    if (session.status === 'COMPLETED' || session.status === 'FAILED') {
      throw new InvalidSessionTransitionError(sessionId, session.status, session.status);
    }
    session.intent = intent;
    session.updatedAt = new Date().toISOString();
    return this.clone(session);
  }

  markTransferring(sessionId: string, destination: TransferDestination): VoiceSession {
    const session = this.transition(sessionId, 'TRANSFERRING');
    const live = this.require(sessionId);
    live.transferRequested = true;
    live.transferDestination = destination;
    live.updatedAt = new Date().toISOString();
    return this.clone(live);
  }

  markTransferCompleted(sessionId: string): VoiceSession {
    const session = this.require(sessionId);
    session.transferCompleted = true;
    session.updatedAt = new Date().toISOString();
    return this.transition(sessionId, 'COMPLETED');
  }

  complete(sessionId: string): VoiceSession {
    return this.transition(sessionId, 'COMPLETED');
  }

  fail(sessionId: string, errorMessage: string): VoiceSession {
    const session = this.require(sessionId);
    session.lastError = errorMessage;
    session.updatedAt = new Date().toISOString();
    return this.transition(sessionId, 'FAILED');
  }

  cleanup(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private transition(sessionId: string, next: SessionStatus): VoiceSession {
    const session = this.require(sessionId);
    if (session.status === next) {
      return this.clone(session);
    }
    if (!ALLOWED_TRANSITIONS[session.status].has(next)) {
      throw new InvalidSessionTransitionError(sessionId, session.status, next);
    }
    session.status = next;
    session.updatedAt = new Date().toISOString();
    return this.clone(session);
  }

  private require(sessionId: string): VoiceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  private clone(session: VoiceSession): VoiceSession {
    return { ...session };
  }
}
