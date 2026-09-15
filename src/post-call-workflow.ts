import type { WorkflowProvider } from './adapters/workflow-provider.js';
import type { CallOutcome, CallerIntent, PostCallEvent, TransferDestination } from './types.js';

export interface BuildPostCallEventInput {
  sessionId: string;
  intent: CallerIntent | null;
  outcome: CallOutcome;
  requiresHumanFollowUp: boolean;
  transferDestination?: TransferDestination | null;
  summary?: string;
}

/**
 * Builds and publishes sanitized post-call events for downstream automation.
 */
export class PostCallWorkflow {
  constructor(private readonly workflow: WorkflowProvider) {}

  buildEvent(input: BuildPostCallEventInput): PostCallEvent {
    return {
      sessionId: input.sessionId,
      intent: input.intent,
      outcome: input.outcome,
      requiresHumanFollowUp: input.requiresHumanFollowUp,
      transferDestination: input.transferDestination ?? null,
      timestamp: new Date().toISOString(),
      summary:
        input.summary ??
        defaultSummary(input.intent, input.outcome, input.requiresHumanFollowUp)
    };
  }

  async publish(input: BuildPostCallEventInput): Promise<{
    event: PostCallEvent;
    accepted: boolean;
    deliveryId: string;
  }> {
    const event = this.buildEvent(input);
    const delivery = await this.workflow.publish(event);
    return {
      event,
      accepted: delivery.accepted,
      deliveryId: delivery.deliveryId
    };
  }
}

function defaultSummary(
  intent: CallerIntent | null,
  outcome: CallOutcome,
  requiresHumanFollowUp: boolean
): string {
  const intentLabel = intent ?? 'unknown';
  const followUp = requiresHumanFollowUp ? 'human follow-up required' : 'no human follow-up required';
  return `Demo call completed with intent=${intentLabel}, outcome=${outcome}, ${followUp}.`;
}
