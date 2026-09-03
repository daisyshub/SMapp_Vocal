/**
 * In-memory implementation of `VocalAPI`.
 * =====================================
 * Lets the prototype run end-to-end with no backend. State lives in a plain
 * object; nothing is persisted. Every call is wrapped in a small artificial
 * latency so loading states in the UI are exercisable.
 *
 * Swap this for a real transport-backed client later — the frontend only ever
 * imports the `VocalAPI` interface, never this file directly.
 */

import type {
  AnalyticsSink,
  VocalAPI,
} from '../services';
import { VocalError } from '../services';
import type {
  AuthSession,
  Booking,
  Caregiver,
  CaregiverContext,
  ChildProfile,
  ConsentRecord,
  Entitlement,
  GoalQuestionnaireResponse,
  ID,
  Pathway,
  PathwayStep,
  Resource,
  SafetyConcern,
  SessionLog,
  Subscription,
  VideoClip,
  VideoProject,
} from '../types';
import * as seed from './data';

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const delay = <T>(value: T, ms = 220): Promise<T> =>
  new Promise((res) => setTimeout(() => res(value), ms));

interface Store {
  session: AuthSession | null;
  caregivers: Map<ID, Caregiver & { passwordHash: string }>;
  consent: Map<ID, ConsentRecord>; // by caregiverId
  children: Map<ID, ChildProfile>;
  questionnaires: Map<ID, GoalQuestionnaireResponse>; // by childId
  pathways: Map<ID, Pathway>;
  sessions: Map<ID, SessionLog>;
  projects: Map<ID, VideoProject>;
  bookings: Map<ID, Booking>;
  subscriptions: Map<ID, Subscription>; // by caregiverId
  concerns: Map<ID, SafetyConcern>;
  notificationPrefs: Map<ID, import('../types').NotificationPreferences>;
}

const FULL_ENTITLEMENTS: Entitlement[] = [
  'video_studio',
  'pathway_planning',
  'consultation_booking',
  'resources_full',
];

export interface MockApiOptions {
  analytics?: AnalyticsSink;
  /** Start already signed-in with the prototype's default caregiver+child. */
  seedSignedIn?: boolean;
  latencyMs?: number;
}

export function createMockApi(opts: MockApiOptions = {}): VocalAPI {
  const ms = opts.latencyMs ?? 220;
  const track = (e: Parameters<AnalyticsSink['track']>[0]) => opts.analytics?.track(e);

  const db: Store = {
    session: null,
    caregivers: new Map(),
    consent: new Map(),
    children: new Map(),
    questionnaires: new Map(),
    pathways: new Map(),
    sessions: new Map(),
    projects: new Map(),
    bookings: new Map(),
    subscriptions: new Map(),
    concerns: new Map(),
    notificationPrefs: new Map(),
  };

  // ---- helpers ----------------------------------------------------------
  const requireCaregiver = (): Caregiver => {
    if (!db.session) throw new VocalError('unauthenticated', 'Sign in first.');
    return db.session.caregiver;
  };
  const requireConsent = (caregiverId: ID) => {
    const c = db.consent.get(caregiverId);
    if (!c?.guardianConfirmed || !c?.dataAndVideoConsent) {
      throw new VocalError('consent_required', 'Caregiver consent is required before this step.');
    }
  };
  const activeChild = (): ChildProfile => {
    const cg = requireCaregiver();
    const mine = [...db.children.values()].filter((c) => c.primaryCaregiverId === cg.id);
    if (!mine.length) throw new VocalError('not_found', 'No child profile yet.');
    return mine[0];
  };
  const getSub = (caregiverId: ID): Subscription => {
    let s = db.subscriptions.get(caregiverId);
    if (!s) {
      s = { id: uid('sub'), caregiverId, status: 'none', entitlements: [] };
      db.subscriptions.set(caregiverId, s);
    }
    return s;
  };
  const requireEntitlement = (e: Entitlement) => {
    const cg = requireCaregiver();
    const s = getSub(cg.id);
    if (!s.entitlements.includes(e)) {
      throw new VocalError('entitlement_required', `This needs an active plan or trial.`, { requiredEntitlement: e });
    }
  };
  const buildPathwayFromTemplate = (childId: ID, questionnaireId: ID): Pathway => {
    const steps: PathwayStep[] = seed.PATHWAY_TEMPLATE.map((t, i) => ({
      id: uid('step'),
      order: i + 1,
      title: t.title,
      objective: t.objective,
      state: i === 0 ? 'not_started' : 'locked',
      exercises: [
        { id: uid('ex'), label: 'Practice with a trusted person, 3x this week', done: false },
        { id: uid('ex'), label: 'Record a self-modelling video for this step', done: false },
      ],
    }));
    return {
      id: uid('pw'),
      childId,
      status: 'draft',
      steps,
      currentStepOrder: 1,
      generation: {
        strategy: 'rules_engine',
        rulesetVersion: '2026.1',
        sourceQuestionnaireId: questionnaireId,
        generatedAt: now(),
      },
      professionalReview: 'not_requested',
      createdAt: now(),
      updatedAt: now(),
    };
  };
  const pathwayForChild = (childId: ID): Pathway | null =>
    [...db.pathways.values()].find((p) => p.childId === childId && p.status !== 'archived') ?? null;

  // ---- optional signed-in seed ----------------------------------------
  if (opts.seedSignedIn) {
    const cg: Caregiver & { passwordHash: string } = {
      id: uid('cg'),
      name: seed.DEFAULT_CAREGIVER_NAME,
      email: 'olena@example.com',
      preferredLanguage: 'en',
      relationshipToChild: 'parent',
      createdAt: now(),
      emailVerified: true,
      passwordHash: 'seed',
    };
    db.caregivers.set(cg.id, cg);
    db.session = { caregiver: cg, token: uid('tok'), expiresAt: now() };
    db.consent.set(cg.id, {
      id: uid('cons'),
      caregiverId: cg.id,
      guardianConfirmed: true,
      dataAndVideoConsent: true,
      policyVersion: seed.CURRENT_POLICY_VERSION,
      acceptedAt: now(),
    });
    const child: ChildProfile = {
      id: uid('ch'),
      primaryCaregiverId: cg.id,
      nickname: seed.DEFAULT_CHILD_NICKNAME,
      ageRange: '6-8',
      comfortableSettings: ['Home', "Grandparent's house"],
      comfortablePeople: ['Parents', 'Older sibling'],
      currentSupport: 'none',
      avatarColour: '5980a6',
      createdAt: now(),
      updatedAt: now(),
    };
    db.children.set(child.id, child);
    const q: GoalQuestionnaireResponse = {
      id: uid('q'),
      childId: child.id,
      answers: { comfortPerson: 'Parent', comfortSetting: 'At home, one-on-one', support: 'None yet', motivator: 'Stickers or a rewards chart' },
      completedAt: now(),
    };
    db.questionnaires.set(child.id, q);
    const pw = buildPathwayFromTemplate(child.id, q.id);
    pw.status = 'active';
    pw.currentStepOrder = 2;
    pw.steps[0].state = 'complete';
    pw.steps[0].completedAt = now();
    pw.steps[1].state = 'practising';
    db.pathways.set(pw.id, pw);
    db.subscriptions.set(cg.id, {
      id: uid('sub'),
      caregiverId: cg.id,
      status: 'trialing',
      planId: 'pl_monthly',
      trialEndsAt: new Date(Date.now() + seed.TRIAL_DAYS * 864e5).toISOString(),
      entitlements: [...FULL_ENTITLEMENTS],
    });
  }

  // =====================================================================
  const api: VocalAPI = {
    // ---- auth ---------------------------------------------------------
    auth: {
      async createAccount(input) {
        const fields: Record<string, string> = {};
        if (!input.name.trim()) fields.name = 'Required';
        if (!/^\S+@\S+\.\S+$/.test(input.email)) fields.email = 'Enter a valid email address.';
        if (input.password.length < 8) fields.password = 'Use at least 8 characters.';
        if (Object.keys(fields).length) throw new VocalError('validation', 'Check the form.', { fields });
        const cg: Caregiver & { passwordHash: string } = {
          id: uid('cg'),
          name: input.name,
          email: input.email,
          preferredLanguage: input.preferredLanguage || 'en',
          relationshipToChild: input.relationshipToChild,
          createdAt: now(),
          emailVerified: false,
          passwordHash: `hash:${input.password.length}`,
        };
        db.caregivers.set(cg.id, cg);
        db.session = { caregiver: cg, token: uid('tok'), expiresAt: new Date(Date.now() + 864e5).toISOString() };
        // carry a pending consent if one was accepted pre-account
        const pending = [...db.consent.values()].find((c) => c.caregiverId === 'pending');
        if (pending) {
          pending.caregiverId = cg.id;
          db.consent.set(cg.id, pending);
        }
        return delay(db.session, ms);
      },
      async signIn(email) {
        const cg = [...db.caregivers.values()].find((c) => c.email === email);
        if (!cg) throw new VocalError('not_found', 'No account for that email.');
        db.session = { caregiver: cg, token: uid('tok'), expiresAt: new Date(Date.now() + 864e5).toISOString() };
        return delay(db.session, ms);
      },
      async signOut() {
        db.session = null;
        return delay(undefined, ms);
      },
      async getContext(): Promise<CaregiverContext> {
        const cg = requireCaregiver();
        const children = [...db.children.values()].filter((c) => c.primaryCaregiverId === cg.id);
        const child = children[0];
        const pathway = child ? pathwayForChild(child.id) ?? undefined : undefined;
        const q = child ? db.questionnaires.get(child.id) : undefined;
        return delay(
          {
            caregiver: cg,
            children,
            activeChildId: child?.id,
            consent: db.consent.get(cg.id),
            subscription: getSub(cg.id),
            pathway,
            onboardingComplete: !!(child && q?.completedAt && pathway),
          },
          ms,
        );
      },
      async updateCaregiver(patch) {
        const cg = requireCaregiver();
        Object.assign(cg, patch);
        db.caregivers.set(cg.id, cg as Caregiver & { passwordHash: string });
        db.session!.caregiver = cg;
        return delay(cg, ms);
      },
      async inviteCoCaregiver(childId, email) {
        const cg = requireCaregiver();
        return delay(
          { id: uid('inv'), childId, invitedEmail: email, invitedByCaregiverId: cg.id, status: 'invited' as const, createdAt: now() },
          ms,
        );
      },
      async listCoCaregivers() {
        requireCaregiver();
        return delay([], ms);
      },
      async revokeCoCaregiver() {
        requireCaregiver();
        return delay(undefined, ms);
      },
    },

    // ---- consent ----------------------------------------------------
    consent: {
      async getCurrentPolicyVersion() {
        return delay({ policyVersion: seed.CURRENT_POLICY_VERSION, policyUrl: '/legal/privacy', termsUrl: '/legal/terms' }, ms);
      },
      async getConsent() {
        const cg = db.session?.caregiver;
        return delay(cg ? db.consent.get(cg.id) ?? null : null, ms);
      },
      async acceptConsent(input) {
        if (!input.guardianConfirmed || !input.dataAndVideoConsent) {
          throw new VocalError('validation', 'Please confirm both to continue.', {
            fields: { consent: 'Please confirm both to continue.' },
          });
        }
        const caregiverId = db.session?.caregiver.id ?? 'pending';
        const record: ConsentRecord = {
          id: uid('cons'),
          caregiverId,
          guardianConfirmed: true,
          dataAndVideoConsent: true,
          policyVersion: input.policyVersion,
          acceptedAt: now(),
        };
        db.consent.set(caregiverId, record);
        track({ name: 'consent_accepted' });
        return delay(record, ms);
      },
    },

    // ---- child profile -------------------------------------------
    child: {
      async list() {
        const cg = requireCaregiver();
        return delay([...db.children.values()].filter((c) => c.primaryCaregiverId === cg.id), ms);
      },
      async get(childId) {
        const c = db.children.get(childId);
        if (!c) throw new VocalError('not_found', 'Child not found.');
        return delay(c, ms);
      },
      async create(input) {
        const cg = requireCaregiver();
        requireConsent(cg.id);
        if (!input.nickname.trim()) {
          throw new VocalError('validation', 'Nickname is required.', { fields: { nickname: 'Nickname is required.' } });
        }
        const child: ChildProfile = {
          id: uid('ch'),
          primaryCaregiverId: cg.id,
          nickname: input.nickname,
          ageRange: input.ageRange,
          comfortableSettings: input.comfortableSettings,
          comfortablePeople: input.comfortablePeople,
          currentSupport: input.currentSupport,
          avatarColour: input.avatarColour,
          createdAt: now(),
          updatedAt: now(),
        };
        db.children.set(child.id, child);
        return delay(child, ms);
      },
      async update(childId, patch) {
        const c = db.children.get(childId);
        if (!c) throw new VocalError('not_found', 'Child not found.');
        Object.assign(c, patch, { updatedAt: now() });
        return delay(c, ms);
      },
    },

    // ---- goals ----------------------------------------------------
    goals: {
      async getQuestions() {
        return delay(seed.GOAL_QUESTIONS, ms);
      },
      async getResponse(childId) {
        return delay(db.questionnaires.get(childId) ?? null, ms);
      },
      async saveAnswers(childId, answers) {
        let r = db.questionnaires.get(childId);
        if (!r) {
          r = { id: uid('q'), childId, answers: {} };
          db.questionnaires.set(childId, r);
        }
        r.answers = { ...r.answers, ...answers };
        const complete = seed.GOAL_QUESTIONS.every((q) => r!.answers[q.key]);
        r.completedAt = complete ? now() : undefined;
        if (complete) track({ name: 'questionnaire_completed', childId });
        return delay(r, ms);
      },
      async generatePathway(childId) {
        const q = db.questionnaires.get(childId);
        if (!q?.completedAt) throw new VocalError('validation', 'Finish the questionnaire first.');
        // Archive any prior draft
        for (const p of db.pathways.values()) {
          if (p.childId === childId && p.status === 'draft') p.status = 'archived';
        }
        const pw = buildPathwayFromTemplate(childId, q.id);
        db.pathways.set(pw.id, pw);
        track({ name: 'pathway_generated', pathwayId: pw.id });
        return delay(pw, ms + 400);
      },
    },

    // ---- pathway ------------------------------------------------
    pathway: {
      async getActive(childId) {
        return delay(pathwayForChild(childId), ms);
      },
      async get(pathwayId) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        return delay(p, ms);
      },
      async saveDraft(pathwayId) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        p.status = 'draft';
        p.updatedAt = now();
        return delay(p, ms);
      },
      async activate(pathwayId) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        p.status = 'active';
        if (p.steps[0] && p.steps[0].state === 'not_started') p.steps[0].state = 'practising';
        p.updatedAt = now();
        track({ name: 'pathway_activated', pathwayId });
        return delay(p, ms);
      },
      async editStep(pathwayId, stepId, edit) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        const idx = p.steps.findIndex((s) => s.id === stepId);
        if (idx < 0) throw new VocalError('not_found', 'Step not found.');
        const step = p.steps[idx];
        switch (edit.op) {
          case 'rename':
            step.title = edit.title;
            break;
          case 'set_objective':
            step.objective = edit.objective;
            break;
          case 'make_easier':
            p.steps.splice(idx, 0, {
              id: uid('step'),
              order: step.order,
              title: `${step.title} (gentler)`,
              objective: `A smaller version of: ${step.objective}`,
              state: 'locked',
              exercises: [],
            });
            break;
          case 'remove':
            p.steps.splice(idx, 1);
            break;
          case 'reorder': {
            const [moved] = p.steps.splice(idx, 1);
            p.steps.splice(edit.toOrder - 1, 0, moved);
            break;
          }
        }
        p.steps.forEach((s, i) => (s.order = i + 1));
        p.updatedAt = now();
        return delay(p, ms);
      },
      async setExerciseDone(pathwayId, stepId, exerciseId, done) {
        const p = db.pathways.get(pathwayId);
        const step = p?.steps.find((s) => s.id === stepId);
        const ex = step?.exercises.find((e) => e.id === exerciseId);
        if (!ex || !step) throw new VocalError('not_found', 'Exercise not found.');
        ex.done = done;
        return delay(step, ms);
      },
      async completeStep(pathwayId, stepId) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        const idx = p.steps.findIndex((s) => s.id === stepId);
        if (idx < 0) throw new VocalError('not_found', 'Step not found.');
        p.steps[idx].state = 'complete';
        p.steps[idx].completedAt = now();
        const next = p.steps[idx + 1];
        if (next) {
          next.state = 'practising';
          p.currentStepOrder = next.order;
        }
        p.updatedAt = now();
        track({ name: 'step_completed', pathwayId, stepOrder: p.steps[idx].order });
        return delay(p, ms);
      },
      async setCurrentStep(pathwayId, stepOrder) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        p.currentStepOrder = stepOrder;
        p.updatedAt = now();
        return delay(p, ms);
      },
      async requestProfessionalReview(pathwayId) {
        const p = db.pathways.get(pathwayId);
        if (!p) throw new VocalError('not_found', 'Pathway not found.');
        p.professionalReview = 'requested';
        p.updatedAt = now();
        return delay(p, ms);
      },
    },

    // ---- session log ------------------------------------------
    sessions: {
      async list(childId, o) {
        let list = [...db.sessions.values()]
          .filter((s) => s.childId === childId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (o?.limit) list = list.slice(0, o.limit);
        return delay(list, ms);
      },
      async create(childId, input) {
        if (!input.activity.trim()) {
          throw new VocalError('validation', 'Describe the activity.', { fields: { activity: 'Describe the activity.' } });
        }
        const cg = requireCaregiver();
        const log: SessionLog = {
          id: uid('log'),
          childId,
          loggedByCaregiverId: cg.id,
          pathwayStepId: input.pathwayStepId,
          activity: input.activity,
          notes: input.notes,
          difficulty: input.difficulty,
          reinforcement: input.reinforcement,
          occurredAt: input.occurredAt ?? now(),
          createdAt: now(),
        };
        db.sessions.set(log.id, log);
        track({ name: 'session_logged', childId, difficulty: log.difficulty });
        return delay(log, ms);
      },
      async update(logId, patch) {
        const log = db.sessions.get(logId);
        if (!log) throw new VocalError('not_found', 'Session not found.');
        Object.assign(log, patch);
        return delay(log, ms);
      },
      async remove(logId) {
        db.sessions.delete(logId);
        return delay(undefined, ms);
      },
      async count(childId) {
        return delay([...db.sessions.values()].filter((s) => s.childId === childId).length, ms);
      },
    },

    // ---- video studio ---------------------------------------
    studio: {
      async startProject(childId, input) {
        requireEntitlement('video_studio');
        const cg = requireCaregiver();
        const project: VideoProject = {
          id: uid('vp'),
          childId,
          createdByCaregiverId: cg.id,
          status: 'draft',
          pathwayStepId: input.pathwayStepId,
          targetBehaviour: input.targetBehaviour,
          clips: [],
          processing: [
            { id: 'reviewing_clips', label: seed.PROCESSING_STAGE_LABELS.reviewing_clips, state: 'pending' },
            { id: 'separating_foreground', label: seed.PROCESSING_STAGE_LABELS.separating_foreground, state: 'pending' },
            { id: 'rendering', label: seed.PROCESSING_STAGE_LABELS.rendering, state: 'pending' },
          ],
          visibility: 'private',
          createdAt: now(),
          updatedAt: now(),
        };
        db.projects.set(project.id, project);
        track({ name: 'video_project_started', projectId: project.id });
        return delay(project, ms);
      },
      async getProject(projectId) {
        const p = db.projects.get(projectId);
        if (!p) throw new VocalError('not_found', 'Project not found.');
        return delay(p, ms);
      },
      async listProjects(childId) {
        return delay([...db.projects.values()].filter((p) => p.childId === childId), ms);
      },
      async requestClipUpload(input) {
        const p = db.projects.get(input.projectId);
        if (!p) throw new VocalError('not_found', 'Project not found.');
        if (!seed.ACCEPTED_CLIP_TYPES.includes(input.contentType)) {
          throw new VocalError('validation', 'Only MP4 or MOV files are supported.', { fields: { file: 'Use MP4 or MOV.' } });
        }
        if (input.sizeBytes > seed.MAX_CLIP_BYTES) {
          throw new VocalError('validation', 'That file is over the 500MB limit.', { fields: { file: 'Max 500MB.' } });
        }
        const clip: VideoClip = {
          id: uid('clip'),
          projectId: p.id,
          fileName: input.fileName,
          uploadProgress: 0,
          uploadStatus: 'uploading',
          sizeBytes: input.sizeBytes,
          contentType: input.contentType,
          createdAt: now(),
        };
        p.clips.push(clip);
        p.status = 'uploading';
        return delay(
          {
            clipId: clip.id,
            uploadUrl: `https://mock-storage.local/${clip.id}`,
            method: 'PUT' as const,
            headers: { 'content-type': input.contentType },
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
          ms,
        );
      },
      async confirmClipUpload(clipId) {
        const p = [...db.projects.values()].find((x) => x.clips.some((c) => c.id === clipId));
        if (!p) throw new VocalError('not_found', 'Clip not found.');
        const clip = p.clips.find((c) => c.id === clipId)!;
        clip.uploadProgress = 100;
        clip.uploadStatus = 'uploaded';
        clip.reviewFlag = Math.random() < 0.3 ? 'has_prompt' : 'usable';
        if (p.clips.every((c) => c.uploadStatus === 'uploaded')) p.status = 'ready_to_process';
        p.updatedAt = now();
        return delay(p, ms);
      },
      async removeClip(clipId) {
        const p = [...db.projects.values()].find((x) => x.clips.some((c) => c.id === clipId));
        if (!p) throw new VocalError('not_found', 'Clip not found.');
        p.clips = p.clips.filter((c) => c.id !== clipId);
        return delay(p, ms);
      },
      async getClipReview(clipId) {
        const clip = [...db.projects.values()].flatMap((p) => p.clips).find((c) => c.id === clipId);
        if (!clip) throw new VocalError('not_found', 'Clip not found.');
        return delay({ clipId, reviewFlag: clip.reviewFlag ?? 'usable' }, ms);
      },
      async startProcessing(projectId) {
        const p = db.projects.get(projectId);
        if (!p) throw new VocalError('not_found', 'Project not found.');
        if (!p.clips.length || p.clips.some((c) => c.uploadStatus !== 'uploaded')) {
          throw new VocalError('validation', 'Upload every clip before processing.');
        }
        p.status = 'processing';
        p.processing = p.processing.map((s, i) => ({ ...s, state: i === 0 ? 'active' : 'pending' }));
        // First attempt fails at stage 2 (mirrors the prototype).
        const willFail = !(p as unknown as { _attempt?: number })._attempt;
        (p as unknown as { _attempt?: number })._attempt =
          ((p as unknown as { _attempt?: number })._attempt ?? 0) + 1;
        setTimeout(() => {
          p.processing[0].state = 'done';
          p.processing[1].state = willFail ? 'failed' : 'active';
          if (willFail) {
            p.status = 'failed';
            track({ name: 'video_processing_failed', projectId, attempt: 1 });
          } else {
            setTimeout(() => {
              p.processing[1].state = 'done';
              p.processing[2].state = 'active';
              setTimeout(() => {
                p.processing[2].state = 'done';
                p.status = 'preview_ready';
                p.previewUrl = `https://mock-storage.local/${p.id}/preview.mp4`;
              }, 700);
            }, 700);
          }
        }, 700);
        return delay(p, ms);
      },
      async retryProcessing(projectId) {
        return api.studio.startProcessing(projectId);
      },
      async exportProject(projectId) {
        const p = db.projects.get(projectId);
        if (!p) throw new VocalError('not_found', 'Project not found.');
        if (p.status !== 'preview_ready') throw new VocalError('validation', 'Nothing to export yet.');
        p.status = 'exported';
        p.exportedAssetId = uid('asset');
        track({ name: 'video_exported', projectId });
        return delay({ project: p, downloadUrl: `https://mock-storage.local/${p.exportedAssetId}.mp4` }, ms);
      },
      async setVisibility(projectId, visibility) {
        const p = db.projects.get(projectId);
        if (!p) throw new VocalError('not_found', 'Project not found.');
        p.visibility = visibility;
        return delay(p, ms);
      },
      async deleteProject(projectId) {
        db.projects.delete(projectId);
        return delay(undefined, ms);
      },
    },

    // ---- resources ---------------------------------------
    resources: {
      async listTopics() {
        return delay(seed.RESOURCE_TOPICS, ms);
      },
      async list(query) {
        let list: Resource[] = [...seed.RESOURCES];
        if (query?.topicId) list = list.filter((r) => r.topicIds.includes(query.topicId!));
        if (query?.format) list = list.filter((r) => r.format === query.format);
        if (query?.audience) list = list.filter((r) => r.audience === query.audience);
        if (query?.search) {
          const q = query.search.toLowerCase();
          list = list.filter((r) => r.title.toLowerCase().includes(q));
        }
        return delay(list, ms);
      },
      async get(resourceId) {
        const r = seed.RESOURCES.find((x) => x.id === resourceId);
        if (!r) throw new VocalError('not_found', 'Resource not found.');
        return delay(r, ms);
      },
    },

    // ---- consultations ---------------------------------
    consultations: {
      async listSpecialists() {
        return delay(seed.SPECIALISTS, ms);
      },
      async getSpecialist(specialistId) {
        const s = seed.SPECIALISTS.find((x) => x.id === specialistId);
        if (!s) throw new VocalError('not_found', 'Specialist not found.');
        return delay(s, ms);
      },
      async getAvailability(specialistId, from, to) {
        const slots: import('../types').TimeSlot[] = [];
        const start = new Date(from);
        const end = new Date(to);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const times = seed.SLOTS_BY_DAY[d.getDate()];
          if (!times) continue;
          for (const t of times) {
            const [h, m] = t.split(':').map(Number);
            const slot = new Date(d);
            slot.setHours(h, m, 0, 0);
            const taken = [...db.bookings.values()].some(
              (b) => b.specialistId === specialistId && b.start === slot.toISOString() && b.status !== 'cancelled',
            );
            slots.push({ start: slot.toISOString(), available: !taken });
          }
        }
        return delay({ specialistId, from, to, slots }, ms);
      },
      async createBooking(childId, input) {
        const cg = requireCaregiver();
        requireEntitlement('consultation_booking');
        const clash = [...db.bookings.values()].some(
          (b) => b.specialistId === input.specialistId && b.start === input.slotStart && b.status !== 'cancelled',
        );
        if (clash) throw new VocalError('conflict', 'That time was just taken. Pick another.');
        const sp = seed.SPECIALISTS.find((x) => x.id === input.specialistId)!;
        const start = new Date(input.slotStart);
        const booking: Booking = {
          id: uid('bk'),
          specialistId: input.specialistId,
          caregiverId: cg.id,
          childId,
          start: input.slotStart,
          endsAt: new Date(start.getTime() + sp.sessionLengthMinutes * 60000).toISOString(),
          status: 'confirmed',
          modality: 'video',
          prepChecklist: [
            { label: 'Share recent session log', done: false },
            { label: 'Prepare questions', done: false },
            { label: 'Test camera & mic', done: false },
          ],
          sharedSessionLogIds: [],
          createdAt: now(),
        };
        db.bookings.set(booking.id, booking);
        track({ name: 'consultation_booked', bookingId: booking.id });
        return delay(booking, ms);
      },
      async listBookings(childId) {
        return delay([...db.bookings.values()].filter((b) => b.childId === childId), ms);
      },
      async reschedule(bookingId, newSlotStart) {
        const b = db.bookings.get(bookingId);
        if (!b) throw new VocalError('not_found', 'Booking not found.');
        const sp = seed.SPECIALISTS.find((x) => x.id === b.specialistId)!;
        b.start = newSlotStart;
        b.endsAt = new Date(new Date(newSlotStart).getTime() + sp.sessionLengthMinutes * 60000).toISOString();
        b.status = 'rescheduled';
        return delay(b, ms);
      },
      async cancel(bookingId) {
        const b = db.bookings.get(bookingId);
        if (!b) throw new VocalError('not_found', 'Booking not found.');
        b.status = 'cancelled';
        return delay(b, ms);
      },
      async updatePrep(bookingId, patch) {
        const b = db.bookings.get(bookingId);
        if (!b) throw new VocalError('not_found', 'Booking not found.');
        if (patch.prepChecklist) b.prepChecklist = patch.prepChecklist;
        if (patch.sharedSessionLogIds) b.sharedSessionLogIds = patch.sharedSessionLogIds;
        return delay(b, ms);
      },
      async getCalendarInvite(bookingId) {
        return delay({ icsUrl: `https://mock-storage.local/${bookingId}.ics` }, ms);
      },
    },

    // ---- subscription --------------------------------
    subscription: {
      async listPlans() {
        return delay(seed.PLANS, ms);
      },
      async get() {
        const cg = requireCaregiver();
        return delay(getSub(cg.id), ms);
      },
      async startTrial(planId) {
        const cg = requireCaregiver();
        const s = getSub(cg.id);
        s.status = 'trialing';
        s.planId = planId;
        s.trialEndsAt = new Date(Date.now() + seed.TRIAL_DAYS * 864e5).toISOString();
        s.entitlements = [...FULL_ENTITLEMENTS];
        track({ name: 'trial_started', planId });
        return delay(s, ms);
      },
      async subscribe(planId) {
        const cg = requireCaregiver();
        const s = getSub(cg.id);
        s.status = 'active';
        s.planId = planId;
        s.currentPeriodEndsAt = new Date(Date.now() + 30 * 864e5).toISOString();
        s.entitlements = [...FULL_ENTITLEMENTS];
        return delay({ subscription: s }, ms);
      },
      async cancel() {
        const cg = requireCaregiver();
        const s = getSub(cg.id);
        s.status = 'canceled';
        s.entitlements = [];
        return delay(s, ms);
      },
      async hasEntitlement(entitlement) {
        const cg = requireCaregiver();
        return delay(getSub(cg.id).entitlements.includes(entitlement), ms);
      },
    },

    // ---- safety -------------------------------------
    safety: {
      async getArticles() {
        return delay(seed.SAFETY_ARTICLES, ms);
      },
      async reportConcern(input) {
        const cg = requireCaregiver();
        const concern: SafetyConcern = {
          id: uid('sc'),
          reportedByCaregiverId: cg.id,
          category: input.category,
          description: input.description,
          relatedEntity: input.relatedEntity,
          status: 'received',
          createdAt: now(),
        };
        db.concerns.set(concern.id, concern);
        track({ name: 'safety_concern_reported', category: input.category });
        return delay(concern, ms);
      },
      async listMyConcerns() {
        const cg = requireCaregiver();
        return delay([...db.concerns.values()].filter((c) => c.reportedByCaregiverId === cg.id), ms);
      },
    },

    // ---- settings ----------------------------------
    settings: {
      async getNotificationPreferences() {
        const cg = requireCaregiver();
        let p = db.notificationPrefs.get(cg.id);
        if (!p) {
          p = { practiceReminders: true, consultationReminders: true, productUpdates: false, channel: 'email' };
          db.notificationPrefs.set(cg.id, p);
        }
        return delay(p, ms);
      },
      async updateNotificationPreferences(patch) {
        const cg = requireCaregiver();
        const p = { ...(await api.settings.getNotificationPreferences()), ...patch };
        db.notificationPrefs.set(cg.id, p);
        return delay(p, ms);
      },
      async requestDataExport() {
        requireCaregiver();
        return delay({ requestId: uid('exp'), status: 'queued' as const }, ms);
      },
      async requestAccountDeletion() {
        requireCaregiver();
        return delay({ requestId: uid('del'), status: 'queued' as const }, ms);
      },
    },
  };

  return api;
}
