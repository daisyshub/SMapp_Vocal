/**
 * Seed data for the mock API — lifted straight from the prototype's own
 * constants (PATHWAY, GOALS_Q, SPECIALISTS, RESOURCES, SLOTS, plan prices,
 * default caregiver "Olena George" / child "Dania").
 */

import type {
  GoalQuestion,
  Plan,
  Resource,
  ResourceTopic,
  Specialist,
} from '../types';

export const DEFAULT_CAREGIVER_NAME = 'Olena George';
export const DEFAULT_CHILD_NICKNAME = 'Dania';

/** The 6-step exposure pathway shown in the prototype. */
export const PATHWAY_TEMPLATE: { title: string; objective: string }[] = [
  { title: 'Comfortable setting, alone', objective: 'Sit and speak comfortably in a familiar room with no other people present.' },
  { title: 'Trusted person nearby', objective: 'Speak comfortably with a trusted caregiver present in the room.' },
  { title: 'Target person enters', objective: 'Continue speaking as a new trusted person quietly joins the room.' },
  { title: 'Answer a familiar question', objective: 'Respond verbally within 5 seconds when asked a familiar question by a trusted person.' },
  { title: 'Initiate a greeting', objective: 'Say hello first, without being prompted.' },
  { title: 'Generalize to a new setting', objective: 'Repeat the behaviour somewhere outside the home.' },
];

export const GOAL_QUESTIONS: GoalQuestion[] = [
  { key: 'comfortPerson', prompt: 'Who does your child speak to most easily?', options: ['Parent', 'Sibling', 'Grandparent', 'Teacher', 'Friend'], multiSelect: false },
  { key: 'comfortSetting', prompt: 'Where is your child most comfortable practicing?', options: ['At home, one-on-one', 'With familiar family or friends', 'In public settings'], multiSelect: false },
  { key: 'support', prompt: 'What support does your child currently have?', options: ['Working with a clinician', 'Support at school', 'None yet'], multiSelect: false },
  { key: 'motivator', prompt: 'What motivates your child most?', options: ['Stickers or a rewards chart', 'Verbal praise', 'Screen time', 'A favourite activity'], multiSelect: false },
];

export const SPECIALISTS: Specialist[] = [
  {
    id: 'sp_alvarez',
    name: 'Dr. Maya Alvarez',
    role: 'Speech-language pathologist',
    blurb: 'Focuses on selective mutism and gradual exposure techniques.',
    price: { amountMinor: 6500, currency: 'USD' },
    sessionLengthMinutes: 30,
  },
  {
    id: 'sp_bork',
    name: 'Dr. Samuel Bork',
    role: 'Child psychologist',
    blurb: '15 years supporting anxious and non-speaking children.',
    price: { amountMinor: 8000, currency: 'USD' },
    sessionLengthMinutes: 30,
  },
  {
    id: 'sp_nandan',
    name: 'Priya Nandan, MEd',
    role: 'School collaboration specialist',
    blurb: 'Helps caregivers coordinate support with teachers.',
    price: { amountMinor: 5500, currency: 'USD' },
    sessionLengthMinutes: 30,
  },
];

export const RESOURCE_TOPICS: ResourceTopic[] = [
  { id: 'tp_understanding', label: 'Understanding SM' },
  { id: 'tp_fading', label: 'Stimulus fading' },
  { id: 'tp_reinforcement', label: 'Reinforcement' },
  { id: 'tp_school', label: 'School' },
];

export const RESOURCES: Resource[] = [
  { id: 'rs_first', title: 'What caregivers can do first', format: 'article', estimatedMinutes: 4, audience: 'caregiver', topicIds: ['tp_understanding'], bodyUrl: '/content/first-steps', publishedAt: '2026-01-10T00:00:00.000Z' },
  { id: 'rs_fading', title: 'Stimulus fading basics', format: 'worksheet', estimatedMinutes: 6, audience: 'caregiver', topicIds: ['tp_fading'], bodyUrl: '/content/stimulus-fading', publishedAt: '2026-01-12T00:00:00.000Z' },
  { id: 'rs_consult', title: 'Preparing for consultations', format: 'checklist', estimatedMinutes: 3, audience: 'caregiver', topicIds: ['tp_understanding'], bodyUrl: '/content/consult-prep', publishedAt: '2026-01-15T00:00:00.000Z' },
  { id: 'rs_school', title: 'School collaboration', format: 'article', estimatedMinutes: 5, audience: 'teacher', topicIds: ['tp_school'], bodyUrl: '/content/school', publishedAt: '2026-01-18T00:00:00.000Z' },
];

export const PLANS: Plan[] = [
  { id: 'pl_weekly', interval: 'weekly', name: 'Weekly', price: { amountMinor: 1800, currency: 'USD' } },
  { id: 'pl_monthly', interval: 'monthly', name: 'Monthly', price: { amountMinor: 6000, currency: 'USD' } },
  { id: 'pl_yearly', interval: 'yearly', name: 'Yearly', price: { amountMinor: 48000, currency: 'USD' } },
];

export const TRIAL_DAYS = 14;

/**
 * Availability from the prototype: only a few March-2026 dates have slots.
 * Keyed by day-of-month.
 */
export const SLOTS_BY_DAY: Record<number, string[]> = {
  12: ['09:00', '10:30', '13:00', '15:30'],
  13: ['11:00', '14:00'],
  19: ['09:30', '12:00', '16:00'],
};

export const PROCESSING_STAGE_LABELS: Record<string, string> = {
  reviewing_clips: 'Reviewing clips',
  separating_foreground: 'Separating foreground',
  rendering: 'Rendering final video',
};

export const SAFETY_ARTICLES = [
  { id: 'sf_moderation', kicker: 'Content moderation', title: 'How uploaded clips are reviewed', bodyUrl: '/safety/moderation' },
  { id: 'sf_parental', kicker: 'Parental controls', title: 'Manage who can view & share', bodyUrl: '/safety/parental-controls' },
  { id: 'sf_privacy', kicker: 'Child data privacy', title: 'What we collect & why', bodyUrl: '/safety/data-privacy' },
  { id: 'sf_report', kicker: 'Report a concern', title: 'Reach our safety team directly', bodyUrl: '/safety/report' },
];

export const CURRENT_POLICY_VERSION = '2026-01-01';
export const MAX_CLIP_BYTES = 500 * 1024 * 1024; // 500 MB
export const ACCEPTED_CLIP_TYPES = ['video/mp4', 'video/quicktime'];
