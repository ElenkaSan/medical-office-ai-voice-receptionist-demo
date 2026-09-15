import type { PostCallEvent } from '../types.js';

export interface WorkflowProvider {
  readonly name: string;
  publish(event: PostCallEvent): Promise<{ accepted: boolean; deliveryId: string }>;
}

/**
 * Offline workflow adapter representing an automation bus (e.g. n8n / queue / webhook).
 * Events must stay synthetic and free of PHI.
 */
export class MockWorkflowProvider implements WorkflowProvider {
  readonly name = 'mock-workflow';
  readonly published: PostCallEvent[] = [];
  private sequence = 0;

  async publish(event: PostCallEvent): Promise<{ accepted: boolean; deliveryId: string }> {
    this.sequence += 1;
    this.published.push(event);
    return {
      accepted: true,
      deliveryId: `mock-delivery-${this.sequence.toString().padStart(4, '0')}`
    };
  }
}
