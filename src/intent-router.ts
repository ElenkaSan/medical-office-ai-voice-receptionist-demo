import type { CallerIntent, IntentDecision, WorkflowAction } from './types.js';

const INTENT_CATALOG: Record<
  CallerIntent,
  { action: WorkflowAction; requiresHumanFollowUp: boolean; reason: string }
> = {
  schedule_appointment: {
    action: 'trigger_scheduling_workflow',
    requiresHumanFollowUp: false,
    reason: 'Administrative scheduling can be routed to a booking workflow.'
  },
  reschedule_appointment: {
    action: 'trigger_reschedule_workflow',
    requiresHumanFollowUp: false,
    reason: 'Administrative reschedule requests can be handled via workflow automation.'
  },
  cancel_appointment: {
    action: 'trigger_cancel_workflow',
    requiresHumanFollowUp: false,
    reason: 'Administrative cancellation can be recorded by a downstream workflow.'
  },
  office_hours: {
    action: 'answer_office_hours',
    requiresHumanFollowUp: false,
    reason: 'Office-hours questions are informational and safe to answer in-session.'
  },
  prescription_request: {
    action: 'escalate_to_staff',
    requiresHumanFollowUp: true,
    reason: 'Prescription requests require staff review and must not be treated as medical advice.'
  },
  lab_question: {
    action: 'escalate_to_staff',
    requiresHumanFollowUp: true,
    reason: 'Lab interpretation requires clinical judgment and human follow-up.'
  },
  speak_to_staff: {
    action: 'escalate_to_staff',
    requiresHumanFollowUp: true,
    reason: 'Caller explicitly requested a human.'
  },
  unknown: {
    action: 'collect_more_information',
    requiresHumanFollowUp: false,
    reason: 'Intent is unclear; gather more context before routing.'
  }
};

const KEYWORD_RULES: Array<{ intent: CallerIntent; patterns: RegExp[] }> = [
  {
    intent: 'schedule_appointment',
    patterns: [/schedule/i, /book.*(appointment|visit)/i, /make.*appointment/i]
  },
  {
    intent: 'reschedule_appointment',
    patterns: [/reschedule/i, /move.*appointment/i, /change.*(time|appointment)/i]
  },
  {
    intent: 'cancel_appointment',
    patterns: [/cancel.*appointment/i, /cancel.*visit/i]
  },
  {
    intent: 'office_hours',
    patterns: [/office hours/i, /what time.*(open|close)/i, /are you open/i]
  },
  {
    intent: 'prescription_request',
    patterns: [/prescription/i, /refill/i, /medication/i]
  },
  {
    intent: 'lab_question',
    patterns: [/lab (result|results)/i, /blood (work|test)/i, /what do my (labs|results) mean/i]
  },
  {
    intent: 'speak_to_staff',
    patterns: [/speak to (someone|staff|a person|nurse|doctor)/i, /transfer me/i, /human/i]
  }
];

/**
 * Maps caller utterances / explicit intents to workflow actions.
 * Clinical or judgment-heavy requests escalate to humans by design.
 */
export class IntentRouter {
  classifyUtterance(text: string): IntentDecision {
    const normalized = text.trim();
    if (!normalized) {
      return this.decide('unknown');
    }

    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(normalized))) {
        return this.decide(rule.intent);
      }
    }

    return this.decide('unknown');
  }

  decide(intent: CallerIntent): IntentDecision {
    const route = INTENT_CATALOG[intent];
    return {
      intent,
      action: route.action,
      requiresHumanFollowUp: route.requiresHumanFollowUp,
      reason: route.reason
    };
  }

  requiresEscalation(intent: CallerIntent): boolean {
    return INTENT_CATALOG[intent].requiresHumanFollowUp;
  }
}
