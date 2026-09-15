/**
 * Shared domain types for the demo voice receptionist architecture.
 * Synthetic only — no PHI, credentials, or client-specific identifiers.
 */

export type SessionStatus =
  | 'INITIALIZING'
  | 'CONNECTED'
  | 'LISTENING'
  | 'PROCESSING'
  | 'TRANSFERRING'
  | 'COMPLETED'
  | 'FAILED';

export type CallerIntent =
  | 'schedule_appointment'
  | 'reschedule_appointment'
  | 'cancel_appointment'
  | 'office_hours'
  | 'prescription_request'
  | 'lab_question'
  | 'speak_to_staff'
  | 'unknown';

export type WorkflowAction =
  | 'trigger_scheduling_workflow'
  | 'trigger_reschedule_workflow'
  | 'trigger_cancel_workflow'
  | 'answer_office_hours'
  | 'escalate_to_staff'
  | 'collect_more_information';

export type TransferDestination = 'front_desk' | 'clinical_callback_queue' | 'after_hours_message';

export type CallOutcome =
  | 'workflow_triggered'
  | 'transferred_to_staff'
  | 'answered_in_session'
  | 'failed';

export interface VoiceSession {
  sessionId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  callerLabel: string;
  intent: CallerIntent | null;
  transferRequested: boolean;
  transferCompleted: boolean;
  transferDestination: TransferDestination | null;
  lastError: string | null;
}

export interface IntentDecision {
  intent: CallerIntent;
  action: WorkflowAction;
  requiresHumanFollowUp: boolean;
  reason: string;
}

export interface TransferRequest {
  sessionId: string;
  destination: TransferDestination;
  reason: string;
}

export interface TransferResult {
  sessionId: string;
  success: boolean;
  destination: TransferDestination;
  providerReference: string | null;
  usedFallback: boolean;
  message: string;
}

export interface PostCallEvent {
  sessionId: string;
  intent: CallerIntent | null;
  outcome: CallOutcome;
  requiresHumanFollowUp: boolean;
  transferDestination: TransferDestination | null;
  timestamp: string;
  summary: string;
}

export interface AudioFrame {
  trackId: string;
  sampleRateHz: number;
  channels: 1;
  pcm16: Int16Array;
  capturedAtMs: number;
}

export type BridgeState = 'idle' | 'bridging' | 'interrupted' | 'stopped';
