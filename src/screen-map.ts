/**
 * Vocal — screen map (design <-> code bridge)
 * ==========================================
 *
 * One entry per screen in the "Vocal" prototype. Each entry says:
 *   - where the screen lives (route + nav section)
 *   - what it needs loaded before it can render (`loads`)
 *   - which `VocalAPI` calls its buttons/inputs make (`actions`)
 *   - where the user goes next (`transitions`)
 *   - any gate that must pass to reach it (`guard`)
 *
 * This is the checklist for wiring the prototype to real endpoints: for every
 * screen, implement `loads` + `actions`, and the screen is "connected".
 *
 * Screen ids and the flow order match the prototype's own `SCREEN_LABELS`,
 * `SECTION_OF` and `JUMP_ORDER` tables.
 */

import type { VocalAPI } from './services';

export type NavSection =
  | 'onboarding'
  | 'home'
  | 'pathway'
  | 'studio'
  | 'resources'
  | 'consult'
  | 'account';

/** Dot-path into VocalAPI, e.g. "pathway.completeStep". Kept as a string so
 *  the map stays declarative; `assertScreenMapWiring()` checks they resolve. */
export type ApiMethodPath = string;

export interface ScreenAction {
  /** UI affordance, e.g. "Mark step complete", "Start trial". */
  label: string;
  /** VocalAPI method(s) this action invokes, in order. */
  calls: ApiMethodPath[];
  /** Screen id to navigate to on success, if any. */
  goto?: ScreenId;
  notes?: string;
}

export interface ScreenSpec {
  id: ScreenId;
  /** Human label from the prototype's top bar. */
  title: string;
  /** Suggested client route. */
  route: string;
  section: NavSection;
  /** Data the screen needs on mount. Empty = static/presentational. */
  loads: ApiMethodPath[];
  actions: ScreenAction[];
  /** Screens reachable from here (superset of action `goto`s). */
  transitions: ScreenId[];
  /** Precondition to enter. Enforced client-side + re-checked server-side. */
  guard?: GuardId;
}

export type GuardId =
  | 'unauthenticated_only' // redirect signed-in users away
  | 'authenticated'
  | 'consent_accepted'
  | 'child_profile_exists'
  | 'questionnaire_complete'
  | 'pathway_exists'
  | 'entitlement:video_studio'
  | 'entitlement:pathway_planning'
  | 'entitlement:consultation_booking';

export type ScreenId =
  // onboarding
  | 'welcome'
  | 'consent'
  | 'account'
  | 'childProfile'
  | 'goals'
  | 'goalsStep'
  | 'planReview'
  | 'pathway'
  | 'pathwayStep'
  | 'subscription'
  // app
  | 'home'
  | 'studioIntro'
  | 'studioUpload'
  | 'studioProcessing'
  | 'studioPreview'
  | 'resources'
  | 'consultBrowse'
  | 'consultCalendar'
  | 'consultConfirm'
  | 'sessionLog'
  | 'settings'
  | 'safety';

// ---------------------------------------------------------------------------

export const SCREENS: Record<ScreenId, ScreenSpec> = {
  // === Onboarding ==========================================================
  welcome: {
    id: 'welcome',
    title: 'Welcome',
    route: '/welcome',
    section: 'onboarding',
    guard: 'unauthenticated_only',
    loads: [],
    actions: [
      { label: 'Get started', calls: [], goto: 'consent' },
      { label: 'I already have an account', calls: ['auth.signIn'], goto: 'home' },
    ],
    transitions: ['consent', 'home'],
  },

  consent: {
    id: 'consent',
    title: 'Caregiver consent & privacy',
    route: '/onboarding/consent',
    section: 'onboarding',
    guard: 'unauthenticated_only',
    loads: ['consent.getCurrentPolicyVersion'],
    actions: [
      {
        label: 'Continue',
        calls: ['consent.acceptConsent'],
        goto: 'account',
        notes: 'Blocked until guardianConfirmed && dataAndVideoConsent are both true.',
      },
    ],
    transitions: ['account'],
  },

  account: {
    id: 'account',
    title: 'Account creation',
    route: '/onboarding/account',
    section: 'onboarding',
    loads: [],
    actions: [
      {
        label: 'Create account',
        calls: ['auth.createAccount'],
        goto: 'childProfile',
        notes: 'Server persists the pending ConsentRecord against the new caregiver.',
      },
      { label: '+ Invite a co-caregiver', calls: ['auth.inviteCoCaregiver'] },
    ],
    transitions: ['childProfile'],
  },

  childProfile: {
    id: 'childProfile',
    title: 'Child profile',
    route: '/onboarding/child',
    section: 'onboarding',
    guard: 'consent_accepted',
    loads: [],
    actions: [{ label: 'Save profile', calls: ['child.create'], goto: 'goals' }],
    transitions: ['goals'],
  },

  goals: {
    id: 'goals',
    title: 'Goals questionnaire',
    route: '/onboarding/goals',
    section: 'onboarding',
    guard: 'child_profile_exists',
    loads: ['goals.getQuestions'],
    actions: [{ label: 'Start questionnaire', calls: [], goto: 'goalsStep' }],
    transitions: ['goalsStep'],
  },

  goalsStep: {
    id: 'goalsStep',
    title: 'Goals questionnaire',
    route: '/onboarding/goals/:index',
    section: 'onboarding',
    guard: 'child_profile_exists',
    loads: ['goals.getQuestions', 'goals.getResponse'],
    actions: [
      { label: 'Next / answer', calls: ['goals.saveAnswers'] },
      {
        label: 'Next (from last question)',
        calls: ['goals.saveAnswers', 'goals.generatePathway'],
        goto: 'planReview',
      },
      { label: 'Back', calls: [], goto: 'goals' },
    ],
    transitions: ['goals', 'planReview'],
  },

  planReview: {
    id: 'planReview',
    title: 'AI plan review',
    route: '/onboarding/plan',
    section: 'onboarding',
    guard: 'questionnaire_complete',
    loads: ['pathway.getActive'],
    actions: [
      { label: 'Edit / Make easier (per step)', calls: ['pathway.editStep'] },
      { label: 'Ask a professional to review', calls: ['pathway.requestProfessionalReview'] },
      { label: 'Save as draft', calls: ['pathway.saveDraft'], goto: 'pathway' },
    ],
    transitions: ['pathway'],
  },

  pathway: {
    id: 'pathway',
    title: 'Practice pathway',
    route: '/pathway',
    section: 'pathway',
    guard: 'pathway_exists',
    loads: ['pathway.getActive'],
    actions: [
      { label: 'Open step', calls: [], goto: 'pathwayStep' },
      {
        label: 'Continue (onboarding)',
        calls: ['pathway.activate'],
        goto: 'subscription',
        notes: 'Only in the onboarding pass; from the nav rail this screen is the landing view.',
      },
      { label: 'Set current step', calls: ['pathway.setCurrentStep'] },
    ],
    transitions: ['pathwayStep', 'subscription'],
  },

  pathwayStep: {
    id: 'pathwayStep',
    title: 'Practice pathway',
    route: '/pathway/step/:stepId',
    section: 'pathway',
    guard: 'pathway_exists',
    loads: ['pathway.getActive'],
    actions: [
      { label: 'Toggle exercise', calls: ['pathway.setExerciseDone'] },
      { label: 'Record a self-modelling video (exercise link)', calls: ['studio.startProject'], goto: 'studioUpload' },
      { label: 'Mark step complete', calls: ['pathway.completeStep'], goto: 'pathway' },
    ],
    transitions: ['pathway', 'studioUpload'],
  },

  subscription: {
    id: 'subscription',
    title: 'Subscription & trial',
    route: '/onboarding/subscription',
    section: 'onboarding',
    loads: ['subscription.listPlans', 'subscription.get'],
    actions: [
      { label: 'Start trial', calls: ['subscription.startTrial'], goto: 'home' },
      { label: 'Continue with limited access', calls: [], goto: 'home' },
    ],
    transitions: ['home'],
  },

  // === Home ================================================================
  home: {
    id: 'home',
    title: 'Home dashboard',
    route: '/',
    section: 'home',
    guard: 'authenticated',
    loads: ['auth.getContext', 'pathway.getActive', 'sessions.count'],
    actions: [
      { label: 'Create video', calls: [], goto: 'studioIntro' },
      { label: 'Resources', calls: [], goto: 'resources' },
      { label: 'Log session', calls: [], goto: 'sessionLog' },
      { label: 'Book consult', calls: [], goto: 'consultBrowse' },
    ],
    transitions: ['studioIntro', 'resources', 'sessionLog', 'consultBrowse', 'pathway'],
  },

  // === Video studio =======================================================
  studioIntro: {
    id: 'studioIntro',
    title: 'Video studio',
    route: '/studio/new',
    section: 'studio',
    guard: 'entitlement:video_studio',
    loads: ['pathway.getActive'],
    actions: [
      {
        label: 'Continue',
        calls: ['studio.startProject'],
        goto: 'studioUpload',
        notes: 'Binds pathwayStepId + targetBehaviour to a new VideoProject.',
      },
    ],
    transitions: ['studioUpload'],
  },

  studioUpload: {
    id: 'studioUpload',
    title: 'Video studio',
    route: '/studio/:projectId/upload',
    section: 'studio',
    guard: 'entitlement:video_studio',
    loads: ['studio.getProject'],
    actions: [
      {
        label: 'Add clips (drop / pick)',
        calls: ['studio.requestClipUpload', 'studio.confirmClipUpload', 'studio.getClipReview'],
        notes: 'MP4/MOV, max 500MB. PUT to the pre-signed URL between request and confirm.',
      },
      { label: 'Remove clip', calls: ['studio.removeClip'] },
      {
        label: 'Continue',
        calls: ['studio.startProcessing'],
        goto: 'studioProcessing',
        notes: 'Enabled only when every clip uploadStatus === "uploaded".',
      },
    ],
    transitions: ['studioProcessing'],
  },

  studioProcessing: {
    id: 'studioProcessing',
    title: 'Video studio',
    route: '/studio/:projectId/processing',
    section: 'studio',
    guard: 'entitlement:video_studio',
    loads: ['studio.getProject'],
    actions: [
      {
        label: '(poll) stage updates',
        calls: ['studio.getProject'],
        notes: 'reviewing_clips -> separating_foreground -> rendering. On success -> studioPreview.',
      },
      { label: 'Retry', calls: ['studio.retryProcessing'] },
      { label: 'Edit clips', calls: [], goto: 'studioUpload' },
    ],
    transitions: ['studioPreview', 'studioUpload'],
  },

  studioPreview: {
    id: 'studioPreview',
    title: 'Video studio',
    route: '/studio/:projectId/preview',
    section: 'studio',
    guard: 'entitlement:video_studio',
    loads: ['studio.getProject'],
    actions: [
      { label: 'Try again / Edit clips', calls: [], goto: 'studioUpload' },
      { label: 'Export video', calls: ['studio.exportProject'], goto: 'home' },
      { label: 'Share with care team', calls: ['studio.setVisibility'] },
    ],
    transitions: ['studioUpload', 'home'],
  },

  // === Resources ==========================================================
  resources: {
    id: 'resources',
    title: 'Resources',
    route: '/resources',
    section: 'resources',
    guard: 'authenticated',
    loads: ['resources.listTopics', 'resources.list'],
    actions: [
      { label: 'Filter by topic', calls: ['resources.list'] },
      { label: 'Open resource', calls: ['resources.get'] },
    ],
    transitions: [],
  },

  // === Consultations ======================================================
  consultBrowse: {
    id: 'consultBrowse',
    title: 'Consultations',
    route: '/consult',
    section: 'consult',
    guard: 'entitlement:consultation_booking',
    loads: ['consultations.listSpecialists'],
    actions: [{ label: 'Book', calls: [], goto: 'consultCalendar' }],
    transitions: ['consultCalendar'],
  },

  consultCalendar: {
    id: 'consultCalendar',
    title: 'Consultations',
    route: '/consult/:specialistId/schedule',
    section: 'consult',
    guard: 'entitlement:consultation_booking',
    loads: ['consultations.getSpecialist', 'consultations.getAvailability'],
    actions: [
      { label: 'Pick date -> load times', calls: ['consultations.getAvailability'] },
      { label: 'Confirm booking', calls: ['consultations.createBooking'], goto: 'consultConfirm' },
    ],
    transitions: ['consultConfirm'],
  },

  consultConfirm: {
    id: 'consultConfirm',
    title: 'Consultations',
    route: '/consult/booking/:bookingId',
    section: 'consult',
    guard: 'entitlement:consultation_booking',
    loads: ['consultations.listBookings'],
    actions: [
      { label: 'Reschedule', calls: ['consultations.reschedule'], goto: 'consultCalendar' },
      { label: 'Add to calendar', calls: ['consultations.getCalendarInvite'] },
      {
        label: 'Before your call (checklist / share log)',
        calls: ['consultations.updatePrep'],
      },
    ],
    transitions: ['consultCalendar'],
  },

  // === Account ============================================================
  sessionLog: {
    id: 'sessionLog',
    title: 'Session log',
    route: '/log',
    section: 'account',
    guard: 'pathway_exists',
    loads: ['pathway.getActive', 'sessions.list'],
    actions: [{ label: 'Save session', calls: ['sessions.create'] }],
    transitions: [],
  },

  settings: {
    id: 'settings',
    title: 'Settings',
    route: '/settings/:tab',
    section: 'account',
    guard: 'authenticated',
    loads: ['auth.getContext', 'settings.getNotificationPreferences'],
    actions: [
      { label: 'Save changes (Account & profile)', calls: ['auth.updateCaregiver'] },
      { label: 'Save (Notifications)', calls: ['settings.updateNotificationPreferences'] },
      { label: 'Export my data', calls: ['settings.requestDataExport'] },
      { label: 'Delete account', calls: ['settings.requestAccountDeletion'] },
      { label: 'Manage billing', calls: ['subscription.get', 'subscription.subscribe', 'subscription.cancel'] },
    ],
    transitions: [],
    // Tabs notifications/privacy/household/billing/preferences are "coming soon"
    // in the prototype — the Account tab is the only wired one today.
  },

  safety: {
    id: 'safety',
    title: 'Safety centre',
    route: '/safety',
    section: 'account',
    guard: 'authenticated',
    loads: ['safety.getArticles'],
    actions: [
      { label: 'Report a concern', calls: ['safety.reportConcern'] },
      { label: 'My concerns', calls: ['safety.listMyConcerns'] },
    ],
    transitions: [],
  },
};

/** The canonical onboarding order (matches the prototype's JUMP_ORDER). */
export const ONBOARDING_FLOW: ScreenId[] = [
  'welcome',
  'consent',
  'account',
  'childProfile',
  'goals',
  'goalsStep',
  'planReview',
  'pathway',
  'pathwayStep',
  'subscription',
];

export const NAV_RAIL: { section: NavSection; label: string; entryScreen: ScreenId }[] = [
  { section: 'home', label: 'Home', entryScreen: 'home' },
  { section: 'pathway', label: 'Pathway', entryScreen: 'pathway' },
  { section: 'studio', label: 'Studio', entryScreen: 'studioIntro' },
  { section: 'resources', label: 'Resources', entryScreen: 'resources' },
  { section: 'consult', label: 'Consult', entryScreen: 'consultBrowse' },
  { section: 'account', label: 'Settings', entryScreen: 'settings' },
];

/**
 * Dev-time check: every ApiMethodPath referenced in the screen map actually
 * exists on a VocalAPI instance. Call once in a test or at app boot in dev.
 */
export function assertScreenMapWiring(api: VocalAPI): string[] {
  const problems: string[] = [];
  const seen = new Set<ApiMethodPath>();
  for (const screen of Object.values(SCREENS)) {
    for (const path of [...screen.loads, ...screen.actions.flatMap((a) => a.calls)]) {
      seen.add(path);
    }
  }
  for (const path of seen) {
    const [ns, method] = path.split('.');
    // @ts-expect-error dynamic probe
    const svc = api[ns];
    if (!svc || typeof svc[method] !== 'function') {
      problems.push(`screen-map references missing API method: ${path}`);
    }
  }
  return problems;
}
