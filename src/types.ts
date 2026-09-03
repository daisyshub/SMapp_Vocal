/**
 * Vocal — domain types
 * =====================
 * A caregiver support tool for children with Selective Mutism (SM).
 *
 * These types are the shared vocabulary between the design (the clickable
 * prototype in the "Vocal" artifact) and the backend features another
 * developer will build. Every screen in `screen-map.ts` reads and writes
 * the shapes defined here.
 *
 * Product guardrails baked into the model (surfaced verbatim in the design):
 *  - Vocal supports caregiver-guided practice and does NOT replace professional care.
 *  - A generated pathway is "suggested — not a treatment plan".
 *  - The goals questionnaire is "used to personalize tools, not for diagnosis".
 *  - Nothing in a pathway advances automatically; the caregiver marks progress.
 *  - Videos are private by default and only shared when the caregiver chooses.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 timestamp, e.g. "2026-03-12T09:00:00.000Z". */
export type ISODateTime = string;
/** Calendar date with no time component, e.g. "2026-03-12". */
export type ISODate = string;

export type ID = string;

export type UUID = string;

/** Money is always minor units + currency to avoid float drift. */
export interface Money {
  /** Amount in minor units (cents). $60.00 -> 6000. */
  amountMinor: number;
  currency: 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD';
}

// ---------------------------------------------------------------------------
// Accounts & caregivers
// ---------------------------------------------------------------------------

export type CaregiverRelationship =
  | 'parent'
  | 'legal_guardian'
  | 'grandparent'
  | 'other_family'
  | 'professional_caregiver';

export interface Caregiver {
  id: ID;
  name: string;
  email: string;
  /** BCP-47 language tag. Design default: "en". */
  preferredLanguage: string;
  relationshipToChild: CaregiverRelationship;
  createdAt: ISODateTime;
  /** True once email ownership is verified. */
  emailVerified: boolean;
}

export type CoCaregiverStatus = 'invited' | 'active' | 'revoked';

export interface CoCaregiverInvite {
  id: ID;
  childId: ID;
  invitedEmail: string;
  invitedByCaregiverId: ID;
  status: CoCaregiverStatus;
  createdAt: ISODateTime;
  acceptedAt?: ISODateTime;
}

// ---------------------------------------------------------------------------
// Consent & privacy  (screen: consent)
// ---------------------------------------------------------------------------

/**
 * Captured BEFORE any child information is collected. The design gates the
 * whole onboarding flow on both flags being true.
 */
export interface ConsentRecord {
  id: ID;
  caregiverId: ID;
  /** "I am the child's parent or legal caregiver" */
  guardianConfirmed: boolean;
  /** "I consent to data & video handling" */
  dataAndVideoConsent: boolean;
  /** Version of the privacy policy / terms the caregiver accepted. */
  policyVersion: string;
  acceptedAt: ISODateTime;
  /** For audit: IP / user-agent hash, set server-side. */
  provenance?: string;
}

// ---------------------------------------------------------------------------
// Child profile  (screen: childProfile)
// ---------------------------------------------------------------------------

export type AgeRange = '3-5' | '6-8' | '9-12' | '13+';

export type CurrentSupport = 'clinician' | 'school' | 'clinician_and_school' | 'none';

export interface ChildProfile {
  id: ID;
  /** Owning caregiver; co-caregivers linked via CoCaregiverInvite. */
  primaryCaregiverId: ID;
  /** Never a legal name in the UI — the design collects a nickname only. */
  nickname: string;
  ageRange: AgeRange;
  /** Free-text places the child is comfortable speaking, e.g. "Home". */
  comfortableSettings: string[];
  /** People the child speaks to comfortably, e.g. "Parents", "Older sibling". */
  comfortablePeople: string[];
  currentSupport: CurrentSupport;
  /** One of a fixed palette in the design. Hex without leading '#'. */
  avatarColour: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Goals questionnaire  (screens: goals, goalsStep)
// ---------------------------------------------------------------------------

/** Stable keys — the design hardcodes these four. */
export type GoalQuestionKey = 'comfortPerson' | 'comfortSetting' | 'support' | 'motivator';

export interface GoalQuestion {
  key: GoalQuestionKey;
  prompt: string;
  options: string[];
  /** Single-select in the current design. */
  multiSelect: false;
}

export type GoalAnswers = Partial<Record<GoalQuestionKey, string>>;

export interface GoalQuestionnaireResponse {
  id: ID;
  childId: ID;
  answers: GoalAnswers;
  completedAt?: ISODateTime;
}

// ---------------------------------------------------------------------------
// Practice pathway  (screens: planReview, pathway, pathwayStep)
// ---------------------------------------------------------------------------

export type PathwayStatus = 'draft' | 'active' | 'archived';

export type PathwayStepState = 'locked' | 'not_started' | 'practising' | 'complete';

export interface PathwayExercise {
  id: ID;
  /** e.g. "Practice with grandmother, 3x this week" */
  label: string;
  done: boolean;
}

export interface PathwayStep {
  id: ID;
  /** 1-based position shown in the UI ("Step 3 of 6"). */
  order: number;
  title: string;
  /** One measurable sentence, e.g. "Say hello first, without being prompted." */
  objective: string;
  state: PathwayStepState;
  exercises: PathwayExercise[];
  completedAt?: ISODateTime;
}

/**
 * How a pathway was produced. The design labels the generated plan
 * "generated from approved rules and evidence-informed content".
 */
export interface PathwayGeneration {
  strategy: 'rules_engine';
  /** Version of the rule set / content pack used. */
  rulesetVersion: string;
  /** The questionnaire response the plan was derived from. */
  sourceQuestionnaireId: ID;
  generatedAt: ISODateTime;
}

export type ProfessionalReviewStatus = 'not_requested' | 'requested' | 'reviewed';

export interface Pathway {
  id: ID;
  childId: ID;
  status: PathwayStatus;
  steps: PathwayStep[];
  /** Index into `steps` the caregiver is currently working on. */
  currentStepOrder: number;
  generation?: PathwayGeneration;
  professionalReview: ProfessionalReviewStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Edit operations the design exposes on a plan-review step. */
export type PathwayStepEdit =
  | { op: 'rename'; title: string }
  | { op: 'set_objective'; objective: string }
  | { op: 'make_easier' } // asks the ruleset to interpolate a gentler step
  | { op: 'remove' }
  | { op: 'reorder'; toOrder: number };

// ---------------------------------------------------------------------------
// Session log  (screen: sessionLog)
// ---------------------------------------------------------------------------

export type SessionDifficulty = 'too_easy' | 'appropriate' | 'too_difficult';

export interface SessionLog {
  id: ID;
  childId: ID;
  loggedByCaregiverId: ID;
  /** Which pathway step was attempted. */
  pathwayStepId: ID;
  /** "Activity & who was present", e.g. "Puzzle with grandmother". */
  activity: string;
  /** Free text: "What went well?" */
  notes?: string;
  difficulty: SessionDifficulty;
  /** "Reinforcement used", e.g. "Sticker chart". */
  reinforcement?: string;
  occurredAt: ISODateTime;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Video studio — self-modelling videos  (screens: studioIntro..studioPreview)
// ---------------------------------------------------------------------------

/**
 * A self-modelling video: a short clip showing the child succeeding at a
 * target behaviour, edited to remove prompts and errors.
 */
export type VideoProjectStatus =
  | 'draft' // goal chosen, no clips yet
  | 'uploading'
  | 'ready_to_process'
  | 'processing'
  | 'failed'
  | 'preview_ready'
  | 'exported';

export type ClipUploadStatus = 'uploading' | 'uploaded' | 'rejected';

/** Post-analysis usability signal shown as a tag on each clip. */
export type ClipReviewFlag = 'usable' | 'has_prompt' | 'unusable';

export interface VideoClip {
  id: ID;
  projectId: ID;
  fileName: string;
  /** 0–100. */
  uploadProgress: number;
  uploadStatus: ClipUploadStatus;
  /** Set once server-side review completes. */
  reviewFlag?: ClipReviewFlag;
  sizeBytes: number;
  /** MIME, constrained to video/mp4 | video/quicktime in the design. */
  contentType: string;
  durationSeconds?: number;
  createdAt: ISODateTime;
}

export type ProcessingStageId = 'reviewing_clips' | 'separating_foreground' | 'rendering';

export interface ProcessingStage {
  id: ProcessingStageId;
  label: string;
  state: 'pending' | 'active' | 'done' | 'failed';
}

export interface VideoProject {
  id: ID;
  childId: ID;
  createdByCaregiverId: ID;
  status: VideoProjectStatus;
  /** Goal binding: a pathway step + the concrete target behaviour. */
  pathwayStepId: ID;
  targetBehaviour: string;
  clips: VideoClip[];
  processing: ProcessingStage[];
  /** Populated when status === 'preview_ready' | 'exported'. */
  previewUrl?: string;
  exportedAssetId?: ID;
  /** Videos are private by default. */
  visibility: 'private' | 'shared_with_care_team';
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ClipUploadTicket {
  clipId: ID;
  /** Pre-signed destination for a direct browser -> storage PUT. */
  uploadUrl: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Resources  (screen: resources)
// ---------------------------------------------------------------------------

export type ResourceFormat = 'article' | 'worksheet' | 'checklist' | 'video';

export type ResourceAudience = 'caregiver' | 'teacher' | 'child';

export interface ResourceTopic {
  id: ID;
  /** e.g. "Understanding SM", "Stimulus fading", "Reinforcement", "School". */
  label: string;
}

export interface Resource {
  id: ID;
  title: string;
  format: ResourceFormat;
  /** Estimated engagement time in minutes. */
  estimatedMinutes: number;
  audience: ResourceAudience;
  topicIds: ID[];
  /** Rendered body or a link out; implementation's choice. */
  bodyUrl: string;
  publishedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Consultations  (screens: consultBrowse, consultCalendar, consultConfirm)
// ---------------------------------------------------------------------------

export interface Specialist {
  id: ID;
  name: string;
  /** e.g. "Speech-language pathologist", "Child psychologist". */
  role: string;
  blurb: string;
  /** Price for the standard 30-minute video consultation. */
  price: Money;
  sessionLengthMinutes: 30;
}

export interface TimeSlot {
  /** Slot start; length is specialist.sessionLengthMinutes. */
  start: ISODateTime;
  available: boolean;
}

export interface SpecialistAvailability {
  specialistId: ID;
  /** Range the availability covers. */
  from: ISODate;
  to: ISODate;
  slots: TimeSlot[];
}

export type BookingStatus = 'confirmed' | 'rescheduled' | 'cancelled' | 'completed';

export interface Booking {
  id: ID;
  specialistId: ID;
  caregiverId: ID;
  childId: ID;
  start: ISODateTime;
  endsAt: ISODateTime;
  status: BookingStatus;
  /** "Video call" in the design; kept open for phone/in-person later. */
  modality: 'video';
  /** The "Before your call" checklist, caregiver-editable. */
  prepChecklist: { label: string; done: boolean }[];
  /** Session logs the caregiver chose to share ahead of the call. */
  sharedSessionLogIds: ID[];
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Subscription & trial  (screen: subscription)
// ---------------------------------------------------------------------------

export type PlanInterval = 'weekly' | 'monthly' | 'yearly';

export interface Plan {
  id: ID;
  interval: PlanInterval;
  price: Money;
  /** Marketing label: "Weekly" | "Monthly" | "Yearly". */
  name: string;
}

export type SubscriptionStatus =
  | 'none' // "continue with limited access"
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export interface Subscription {
  id: ID;
  caregiverId: ID;
  status: SubscriptionStatus;
  planId?: ID;
  trialEndsAt?: ISODateTime;
  currentPeriodEndsAt?: ISODateTime;
  /** Feature gate the frontend checks before entering paid areas. */
  entitlements: Entitlement[];
}

export type Entitlement =
  | 'video_studio'
  | 'pathway_planning'
  | 'consultation_booking'
  | 'resources_full';

// ---------------------------------------------------------------------------
// Safety centre  (screen: safety)
// ---------------------------------------------------------------------------

export type SafetyConcernCategory =
  | 'content_moderation'
  | 'account_access'
  | 'child_wellbeing'
  | 'data_privacy'
  | 'other';

export interface SafetyConcern {
  id: ID;
  reportedByCaregiverId: ID;
  category: SafetyConcernCategory;
  description: string;
  /** Optional pointer to the object in question. */
  relatedEntity?: { type: 'video_project' | 'booking' | 'resource' | 'account'; id: ID };
  status: 'received' | 'in_review' | 'resolved';
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Settings  (screen: settings)
// ---------------------------------------------------------------------------

export type SettingsTab =
  | 'account'
  | 'notifications'
  | 'privacy'
  | 'household'
  | 'billing'
  | 'preferences';

export interface NotificationPreferences {
  practiceReminders: boolean;
  consultationReminders: boolean;
  productUpdates: boolean;
  channel: 'email' | 'push' | 'both';
}

// ---------------------------------------------------------------------------
// Session / auth context
// ---------------------------------------------------------------------------

export interface AuthSession {
  caregiver: Caregiver;
  token: string;
  expiresAt: ISODateTime;
}

/**
 * The bundle the app loads once after sign-in to render Home and drive the
 * nav rail. Every screen can be served from this plus targeted calls.
 */
export interface CaregiverContext {
  caregiver: Caregiver;
  /** Current design assumes one child; array keeps multi-child open. */
  children: ChildProfile[];
  activeChildId?: ID;
  consent?: ConsentRecord;
  subscription: Subscription;
  pathway?: Pathway;
  onboardingComplete: boolean;
}
