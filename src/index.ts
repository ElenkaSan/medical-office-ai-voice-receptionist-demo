import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { MockRealtimeProvider } from './adapters/realtime-provider.js';
import { MockTelephonyProvider } from './adapters/telephony-provider.js';
import { MockWorkflowProvider } from './adapters/workflow-provider.js';
import { AudioBridge } from './audio-bridge.js';
import { loadConfig } from './config.js';
import { IntentRouter } from './intent-router.js';
import { PostCallWorkflow } from './post-call-workflow.js';
import {
  InvalidSessionTransitionError,
  SessionNotFoundError,
  VoiceSessionManager
} from './session-manager.js';
import { TransferOrchestrator } from './transfer-orchestrator.js';
import type { CallerIntent, TransferDestination } from './types.js';

const createCallBody = z.object({
  callerLabel: z.string().min(1).max(80).default('demo-caller')
});

const intentBody = z.object({
  text: z.string().min(1).max(500).optional(),
  intent: z
    .enum([
      'schedule_appointment',
      'reschedule_appointment',
      'cancel_appointment',
      'office_hours',
      'prescription_request',
      'lab_question',
      'speak_to_staff',
      'unknown'
    ])
    .optional()
}).refine((value) => Boolean(value.text || value.intent), {
  message: 'Provide either text or intent'
});

const transferBody = z.object({
  destination: z
    .enum(['front_desk', 'clinical_callback_queue', 'after_hours_message'])
    .default('front_desk'),
  reason: z.string().min(1).max(240).default('Caller requested staff assistance')
});

export function buildApp(options?: {
  telephony?: MockTelephonyProvider;
}) {
  const config = loadConfig();
  const sessions = new VoiceSessionManager();
  const intentRouter = new IntentRouter();
  const realtime = new MockRealtimeProvider();
  const telephony = options?.telephony ?? new MockTelephonyProvider();
  const workflowProvider = new MockWorkflowProvider();
  const transferOrchestrator = new TransferOrchestrator(sessions, telephony);
  const postCall = new PostCallWorkflow(workflowProvider);
  const bridges = new Map<string, AudioBridge>();

  const app = Fastify({ logger: config.NODE_ENV !== 'test' });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof SessionNotFoundError) {
      return reply.status(404).send({ error: error.message });
    }
    if (error instanceof InvalidSessionTransitionError) {
      return reply.status(409).send({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Validation failed', details: error.flatten() });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'medical-office-ai-voice-receptionist-demo',
    providerMode: config.PROVIDER_MODE,
    activeSessions: sessions.listSessions().filter((s) => s.status !== 'COMPLETED' && s.status !== 'FAILED')
      .length
  }));

  app.post('/demo/calls', async (request, reply) => {
    const body = createCallBody.parse(request.body ?? {});
    const session = sessions.createSession(body.callerLabel);
    sessions.markConnected(session.sessionId);
    sessions.markListening(session.sessionId);

    const bridge = new AudioBridge(session.sessionId, realtime);
    await bridge.start();
    bridges.set(session.sessionId, bridge);

    return reply.status(201).send({
      session: sessions.getSession(session.sessionId),
      bridge: bridge.getStatus(),
      note: 'Demo session created with mock realtime bridge. No external providers were contacted.'
    });
  });

  app.get('/demo/calls/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    return {
      session: sessions.getSession(sessionId),
      bridge: bridges.get(sessionId)?.getStatus() ?? null
    };
  });

  app.post('/demo/calls/:sessionId/intent', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = intentBody.parse(request.body ?? {});

    sessions.markProcessing(sessionId);
    const decision = body.intent
      ? intentRouter.decide(body.intent as CallerIntent)
      : intentRouter.classifyUtterance(body.text ?? '');

    sessions.setIntent(sessionId, decision.intent);

    if (!decision.requiresHumanFollowUp) {
      sessions.markListening(sessionId);
    }

    return {
      session: sessions.getSession(sessionId),
      decision,
      safetyNote:
        decision.requiresHumanFollowUp
          ? 'This request should escalate to staff. The demo does not provide medical advice.'
          : 'Administrative workflow can continue without clinical advice.'
    };
  });

  app.post('/demo/calls/:sessionId/transfer', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const body = transferBody.parse(request.body ?? {});
    const session = sessions.getSession(sessionId);

    const result = await transferOrchestrator.transferToStaff(
      sessionId,
      body.destination as TransferDestination,
      body.reason
    );

    const bridge = bridges.get(sessionId);
    if (bridge && result.success) {
      await bridge.stop();
      bridges.delete(sessionId);
    }

    const published = result.success
      ? await postCall.publish({
          sessionId,
          intent: session.intent,
          outcome: 'transferred_to_staff',
          requiresHumanFollowUp: true,
          transferDestination: result.destination,
          summary: `Demo transfer completed via ${telephony.name}.`
        })
      : null;

    return {
      transfer: result,
      session: sessions.getSession(sessionId),
      postCall: published
    };
  });

  app.post('/demo/calls/:sessionId/complete', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    let session = sessions.getSession(sessionId);

    if (session.status !== 'COMPLETED' && session.status !== 'FAILED') {
      session = sessions.complete(sessionId);
    }

    const bridge = bridges.get(sessionId);
    if (bridge) {
      await bridge.stop();
      bridges.delete(sessionId);
    }

    const requiresHumanFollowUp = session.intent
      ? intentRouter.requiresEscalation(session.intent)
      : false;

    const outcome = session.transferCompleted
      ? 'transferred_to_staff'
      : session.intent && !requiresHumanFollowUp
        ? 'workflow_triggered'
        : requiresHumanFollowUp
          ? 'transferred_to_staff'
          : 'answered_in_session';

    const published = await postCall.publish({
      sessionId,
      intent: session.intent,
      outcome,
      requiresHumanFollowUp: requiresHumanFollowUp || session.transferCompleted,
      transferDestination: session.transferDestination
    });

    return {
      session: sessions.getSession(sessionId),
      postCall: published
    };
  });

  return app;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
