import { describe, expect, it } from 'vitest';
import { IntentRouter } from '../src/intent-router.js';

describe('IntentRouter', () => {
  const router = new IntentRouter();

  it('routes administrative scheduling intents to workflow actions', () => {
    const decision = router.classifyUtterance('I need to schedule an appointment next week');
    expect(decision.intent).toBe('schedule_appointment');
    expect(decision.action).toBe('trigger_scheduling_workflow');
    expect(decision.requiresHumanFollowUp).toBe(false);
  });

  it('escalates clinical lab questions to staff', () => {
    const decision = router.classifyUtterance('What do my lab results mean?');
    expect(decision.intent).toBe('lab_question');
    expect(decision.action).toBe('escalate_to_staff');
    expect(decision.requiresHumanFollowUp).toBe(true);
  });

  it('escalates prescription requests instead of offering medical advice', () => {
    const decision = router.decide('prescription_request');
    expect(decision.requiresHumanFollowUp).toBe(true);
    expect(decision.action).toBe('escalate_to_staff');
  });

  it('returns unknown when the utterance is unclear', () => {
    const decision = router.classifyUtterance('um hello');
    expect(decision.intent).toBe('unknown');
    expect(decision.action).toBe('collect_more_information');
  });
});
