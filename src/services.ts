/**
 * Vocal — service interfaces (the frontend/backend contract)
 * =========================================================
 *
 * Each interface below is a slice of functionality that the design's screens
 * call into. The frontend developer codes against `VocalAPI`. The backend
 * developer implements it (REST, tRPC, GraphQL — the transport is their
 * choice; this file only fixes the shapes and the semantics).
 *
 * A ready-to-use in-memory implementation lives in `mock/mock-api.ts`, so the
 * design is clickable end-to-end before any endpoint exists.
 *
 * Conventions
 * -----------
 *  - Every method is async and returns the resource (or void). Failures throw
 *    a `VocalError` (see below) — never a bare string.
 *  - "current caregiver" / "active child" are resolved from the auth token by
 *    the implementation; screens never pass a caregiverId for their own user.
 *  - Money is `{ amountMinor, currency }`. Dates are ISO strings.
 */

import type {
  AgeRange,
  AuthSession,
  Booking,
  Caregiver,
  CaregiverContext,
  CaregiverRelationship,
  ChildProfile,
  ClipReviewFlag,
  ClipUploadTicket,
  CoCaregiverInvite,
  ConsentRecord,
  Entitlement,
  GoalAnswers,
  GoalQuestion,
  GoalQuestionnaireResponse,
  ID,
  ISODate,
  NotificationPreferences,
  Pathway,
  PathwayStep,
  PathwayStepEdit,
  Plan,
  Resource,
  ResourceAudience,
  ResourceFormat,
  ResourceTopic,
  SafetyConcern,
  SafetyConcernCategory,
  SessionDifficulty,
  SessionLog,
  Specialist,
  SpecialistAvailability,
  Subscription,
  VideoProject,
} from './types';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type VocalErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation' // field-level problems; see `fields`
  | 'consent_required' // caregiver has not completed the consent gate
  | 'entitlement_required' // action needs a subscription/trial
  | 'conflict' // e.g. double-booking a slot
  | 'upload_failed'
  | 'processing_failed'
  | 'rate_limited'
  | 'server_error';

export class VocalError extends Error {
  code: VocalErrorCode;
  /** Field -> human message, for `validation`. */
  fields?: Record<string, string>;
  /** For `entitlement_required`: what unlocks the action. */
  requiredEntitlement?: Entitlement;

  constructor(
    code: VocalErrorCode,
    message: string,
    opts?: { fields?: Record<string, string>; requiredEntitlement?: Entitlement },
  ) {
    super(message);
    this.name = 'VocalError';
    this.code = code;
    this.fields = opts?.fields;
    this.requiredEntitlement = opts?.requiredEntitlement;
  }
}

// ---------------------------------------------------------------------------
// Input payloads
// ---------------------------------------------------------------------------

export interface CreateAccountInput {
  name: string;
  email: string;
  /** Plain text over TLS; implementation hashes. Never logged. */
  password: string;
  preferredLanguage: string;
  relationshipToChild: CaregiverRelationship;
}

export interface AcceptConsentInput {
  guardianConfirmed: boolean;
  dataAndVideoConsent: boolean;
  policyVersion: string;
}

export interface ChildProfileInput {
  nickname: string;
  ageRange: AgeRange;
  comfortableSettings: string[];
  comfortablePeople: string[];
  currentSupport: ChildProfile['currentSupport'];
  avatarColour: string;
}

export interface CreateSessionLogInput {
  pathwayStepId: ID;
  activity: string;
  notes?: string;
  difficulty: SessionDifficulty;
  reinforcement?: string;
  /** Defaults to now if omitted. */
  occurredAt?: string;
}

export interface StartVideoProjectInput {
  pathwayStepId: ID;
  targetBehaviour: string;
}

export interface RequestClipUploadInput {
  projectId: ID;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateBookingInput {
  specialistId: ID;
  /** Must match an available slot start from `getAvailability`. */
  slotStart: string;
}

export interface ResourceQuery {
  topicId?: ID;
  format?: ResourceFormat;
  audience?: ResourceAudience;
  search?: string;
}

// ---------------------------------------------------------------------------
// 1. Auth & account   (screens: welcome, account, settings)
// ---------------------------------------------------------------------------

export interface AuthService {
  createAccount(input: CreateAccountInput): Promise<AuthSession>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  /** Drives the top-bar identity + nav rail + Home. */
  getContext(): Promise<CaregiverContext>;
  updateCaregiver(patch: Partial<Pick<Caregiver, 'name' | 'email' | 'preferredLanguage' | 'relationshipToChild'>>): Promise<Caregiver>;
  inviteCoCaregiver(childId: ID, email: string): Promise<CoCaregiverInvite>;
  listCoCaregivers(childId: ID): Promise<CoCaregiverInvite[]>;
  revokeCoCaregiver(inviteId: ID): Promise<void>;
}

// ---------------------------------------------------------------------------
// 2. Consent   (screen: consent)
// ---------------------------------------------------------------------------

export interface ConsentService {
  /** Latest policy/terms the caregiver must accept. */
  getCurrentPolicyVersion(): Promise<{ policyVersion: string; policyUrl: string; termsUrl: string }>;
  getConsent(): Promise<ConsentRecord | null>;
  /**
   * Throws `validation` if either flag is false — the design blocks
   * "Continue" until both are checked.
   */
  acceptConsent(input: AcceptConsentInput): Promise<ConsentRecord>;
}

// ---------------------------------------------------------------------------
// 3. Child profile   (screen: childProfile)
// ---------------------------------------------------------------------------

export interface ChildProfileService {
  list(): Promise<ChildProfile[]>;
  get(childId: ID): Promise<ChildProfile>;
  /** Requires a completed ConsentRecord, else throws `consent_required`. */
  create(input: ChildProfileInput): Promise<ChildProfile>;
  update(childId: ID, patch: Partial<ChildProfileInput>): Promise<ChildProfile>;
}

// ---------------------------------------------------------------------------
// 4. Goals questionnaire   (screens: goals, goalsStep, planReview)
// ---------------------------------------------------------------------------

export interface GoalsService {
  /** The fixed set of questions (4 in the current design). */
  getQuestions(): Promise<GoalQuestion[]>;
  getResponse(childId: ID): Promise<GoalQuestionnaireResponse | null>;
  /** Idempotent upsert as the caregiver steps through; call per answer or once. */
  saveAnswers(childId: ID, answers: GoalAnswers): Promise<GoalQuestionnaireResponse>;
  /**
   * Runs the rules engine on the completed questionnaire and returns a DRAFT
   * pathway. Design copy: "generated from approved rules and evidence-informed
   * content" and "Suggested — not a treatment plan".
   */
  generatePathway(childId: ID): Promise<Pathway>;
}

// ---------------------------------------------------------------------------
// 5. Pathway   (screens: planReview, pathway, pathwayStep, home)
// ---------------------------------------------------------------------------

export interface PathwayService {
  getActive(childId: ID): Promise<Pathway | null>;
  get(pathwayId: ID): Promise<Pathway>;
  /** planReview: "Save as draft". */
  saveDraft(pathwayId: ID): Promise<Pathway>;
  /** Moves a draft to `active` once the caregiver accepts it. */
  activate(pathwayId: ID): Promise<Pathway>;
  /** planReview edits: rename, set objective, "Make easier", remove, reorder. */
  editStep(pathwayId: ID, stepId: ID, edit: PathwayStepEdit): Promise<Pathway>;
  /** pathwayStep: tick / untick an exercise. */
  setExerciseDone(pathwayId: ID, stepId: ID, exerciseId: ID, done: boolean): Promise<PathwayStep>;
  /**
   * pathwayStep: "Mark step complete". Explicit, caregiver-driven — the design
   * stresses nothing advances automatically. Advances `currentStepOrder`.
   */
  completeStep(pathwayId: ID, stepId: ID): Promise<Pathway>;
  /** Lets the caregiver move focus without completing (e.g. revisit a step). */
  setCurrentStep(pathwayId: ID, stepOrder: number): Promise<Pathway>;
  /** planReview: "Ask a professional to review". */
  requestProfessionalReview(pathwayId: ID): Promise<Pathway>;
}

// ---------------------------------------------------------------------------
// 6. Session log   (screen: sessionLog, home progress tile)
// ---------------------------------------------------------------------------

export interface SessionLogService {
  list(childId: ID, opts?: { limit?: number; before?: string }): Promise<SessionLog[]>;
  create(childId: ID, input: CreateSessionLogInput): Promise<SessionLog>;
  update(logId: ID, patch: Partial<CreateSessionLogInput>): Promise<SessionLog>;
  remove(logId: ID): Promise<void>;
  /** Home tile: "Progress: N sessions logged". */
  count(childId: ID): Promise<number>;
}

// ---------------------------------------------------------------------------
// 7. Video studio   (screens: studioIntro, studioUpload, studioProcessing, studioPreview)
// ---------------------------------------------------------------------------

export interface VideoStudioService {
  /** studioIntro: bind a pathway step + target behaviour. */
  startProject(childId: ID, input: StartVideoProjectInput): Promise<VideoProject>;
  getProject(projectId: ID): Promise<VideoProject>;
  listProjects(childId: ID): Promise<VideoProject[]>;

  /**
   * studioUpload: get a pre-signed URL, PUT the file straight to storage,
   * then call `confirmClipUpload`. Constraints from the design: MP4/MOV,
   * max 500 MB. Oversize / wrong type -> `validation`.
   */
  requestClipUpload(input: RequestClipUploadInput): Promise<ClipUploadTicket>;
  confirmClipUpload(clipId: ID): Promise<VideoProject>;
  removeClip(clipId: ID): Promise<VideoProject>;
  /** Server-side pass that sets each clip's `reviewFlag`. */
  getClipReview(clipId: ID): Promise<{ clipId: ID; reviewFlag: ClipReviewFlag }>;

  /**
   * studioProcessing: kick off "Reviewing clips -> Separating foreground ->
   * Rendering final video". Poll `getProject` (or subscribe) for stage state.
   * On failure the project goes `failed`; `retryProcessing` restarts it.
   */
  startProcessing(projectId: ID): Promise<VideoProject>;
  retryProcessing(projectId: ID): Promise<VideoProject>;

  /** studioPreview: "Export video" -> downloadable/shareable asset. */
  exportProject(projectId: ID): Promise<{ project: VideoProject; downloadUrl: string }>;
  setVisibility(projectId: ID, visibility: VideoProject['visibility']): Promise<VideoProject>;
  deleteProject(projectId: ID): Promise<void>;
}

// ---------------------------------------------------------------------------
// 8. Resources   (screen: resources)
// ---------------------------------------------------------------------------

export interface ResourcesService {
  listTopics(): Promise<ResourceTopic[]>;
  list(query?: ResourceQuery): Promise<Resource[]>;
  get(resourceId: ID): Promise<Resource>;
}

// ---------------------------------------------------------------------------
// 9. Consultations   (screens: consultBrowse, consultCalendar, consultConfirm)
// ---------------------------------------------------------------------------

export interface ConsultationService {
  listSpecialists(): Promise<Specialist[]>;
  getSpecialist(specialistId: ID): Promise<Specialist>;
  /** consultCalendar: calendar grid + time-slot chips for a month. */
  getAvailability(specialistId: ID, from: ISODate, to: ISODate): Promise<SpecialistAvailability>;
  /** consultConfirm. Throws `conflict` if the slot was just taken. */
  createBooking(childId: ID, input: CreateBookingInput): Promise<Booking>;
  listBookings(childId: ID): Promise<Booking[]>;
  reschedule(bookingId: ID, newSlotStart: string): Promise<Booking>;
  cancel(bookingId: ID): Promise<Booking>;
  /** "Before your call" checklist + "Share recent session log". */
  updatePrep(
    bookingId: ID,
    patch: { prepChecklist?: Booking['prepChecklist']; sharedSessionLogIds?: ID[] },
  ): Promise<Booking>;
  /** consultConfirm: "Add to calendar". */
  getCalendarInvite(bookingId: ID): Promise<{ icsUrl: string }>;
}

// ---------------------------------------------------------------------------
// 10. Subscription   (screen: subscription, settings > billing)
// ---------------------------------------------------------------------------

export interface SubscriptionService {
  listPlans(): Promise<Plan[]>;
  get(): Promise<Subscription>;
  /** subscription: "Start trial" (14 days in the design). */
  startTrial(planId: ID): Promise<Subscription>;
  /** Convert trial -> active / change plan. Returns a checkout handoff if needed. */
  subscribe(planId: ID): Promise<{ subscription: Subscription; checkoutUrl?: string }>;
  cancel(): Promise<Subscription>;
  /** Frontend gate before entering a paid area. */
  hasEntitlement(entitlement: Entitlement): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// 11. Safety centre   (screen: safety)
// ---------------------------------------------------------------------------

export interface SafetyService {
  /** Static content cards: moderation, parental controls, data privacy. */
  getArticles(): Promise<{ id: ID; kicker: string; title: string; bodyUrl: string }[]>;
  reportConcern(input: {
    category: SafetyConcernCategory;
    description: string;
    relatedEntity?: SafetyConcern['relatedEntity'];
  }): Promise<SafetyConcern>;
  listMyConcerns(): Promise<SafetyConcern[]>;
}

// ---------------------------------------------------------------------------
// 12. Settings   (screen: settings)
// ---------------------------------------------------------------------------

export interface SettingsService {
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(patch: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
  /** Privacy & data tab: export / delete-account requests. */
  requestDataExport(): Promise<{ requestId: ID; status: 'queued' }>;
  requestAccountDeletion(): Promise<{ requestId: ID; status: 'queued' }>;
}

// ---------------------------------------------------------------------------
// The aggregate the frontend depends on
// ---------------------------------------------------------------------------

export interface VocalAPI {
  auth: AuthService;
  consent: ConsentService;
  child: ChildProfileService;
  goals: GoalsService;
  pathway: PathwayService;
  sessions: SessionLogService;
  studio: VideoStudioService;
  resources: ResourcesService;
  consultations: ConsultationService;
  subscription: SubscriptionService;
  safety: SafetyService;
  settings: SettingsService;
}

/**
 * Optional analytics contract. The design has funnels worth instrumenting
 * (onboarding drop-off, studio processing failure, trial start). Implement or
 * no-op.
 */
export interface AnalyticsSink {
  track(event: VocalAnalyticsEvent): void;
}

export type VocalAnalyticsEvent =
  | { name: 'onboarding_step_viewed'; screenId: string }
  | { name: 'consent_accepted' }
  | { name: 'questionnaire_completed'; childId: ID }
  | { name: 'pathway_generated'; pathwayId: ID }
  | { name: 'pathway_activated'; pathwayId: ID }
  | { name: 'step_completed'; pathwayId: ID; stepOrder: number }
  | { name: 'session_logged'; childId: ID; difficulty: SessionDifficulty }
  | { name: 'video_project_started'; projectId: ID }
  | { name: 'video_processing_failed'; projectId: ID; attempt: number }
  | { name: 'video_exported'; projectId: ID }
  | { name: 'trial_started'; planId: ID }
  | { name: 'consultation_booked'; bookingId: ID }
  | { name: 'safety_concern_reported'; category: SafetyConcernCategory };
