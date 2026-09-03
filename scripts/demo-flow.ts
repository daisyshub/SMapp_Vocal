/**
 * Walks the whole prototype flow against the mock API, printing each step.
 * Proves the contract is coherent end-to-end.
 *
 *   npm run demo   (or: npx tsx scripts/demo-flow.ts)
 */
import { createMockApi } from '../src/mock/mock-api';
import { CURRENT_POLICY_VERSION } from '../src/mock/data';

const api = createMockApi({ analytics: { track: (e) => console.log('  · analytics:', e.name) } });
const log = (s: string) => console.log('\n▶ ' + s);

async function main() {
  log('welcome → consent');
  await api.consent.acceptConsent({
    guardianConfirmed: true,
    dataAndVideoConsent: true,
    policyVersion: CURRENT_POLICY_VERSION,
  });

  log('account');
  const session = await api.auth.createAccount({
    name: 'Olena George',
    email: 'olena@example.com',
    password: 'practice123',
    preferredLanguage: 'en',
    relationshipToChild: 'parent',
  });
  console.log('  signed in as', session.caregiver.name);

  log('childProfile');
  const child = await api.child.create({
    nickname: 'Dania',
    ageRange: '6-8',
    comfortableSettings: ['Home', "Grandparent's house"],
    comfortablePeople: ['Parents', 'Older sibling'],
    currentSupport: 'none',
    avatarColour: '5980a6',
  });

  log('goals → goalsStep (x4)');
  await api.goals.saveAnswers(child.id, {
    comfortPerson: 'Parent',
    comfortSetting: 'At home, one-on-one',
    support: 'None yet',
    motivator: 'Stickers or a rewards chart',
  });

  log('planReview — generate + review + save draft');
  let pathway = await api.goals.generatePathway(child.id);
  console.log('  generated', pathway.steps.length, 'steps, ruleset', pathway.generation?.rulesetVersion);
  pathway = await api.pathway.editStep(pathway.id, pathway.steps[3].id, { op: 'make_easier' });
  await api.pathway.requestProfessionalReview(pathway.id);
  await api.pathway.saveDraft(pathway.id);

  log('pathway — activate → open step → mark complete');
  pathway = await api.pathway.activate(pathway.id);
  pathway = await api.pathway.completeStep(pathway.id, pathway.steps[0].id);
  console.log('  current step is now #', pathway.currentStepOrder);

  log('subscription — start 14-day trial');
  const sub = await api.subscription.startTrial('pl_monthly');
  console.log('  status', sub.status, '· entitlements', sub.entitlements.join(', '));

  log('home');
  const ctx = await api.auth.getContext();
  console.log('  onboardingComplete =', ctx.onboardingComplete);

  log('sessionLog');
  await api.sessions.create(child.id, {
    pathwayStepId: pathway.steps[pathway.currentStepOrder - 1].id,
    activity: 'Puzzle with grandmother',
    notes: 'Whispered two answers',
    difficulty: 'appropriate',
    reinforcement: 'Sticker chart',
  });
  console.log('  sessions logged:', await api.sessions.count(child.id));

  log('studio — start → upload → process (fails) → retry → export');
  let project = await api.studio.startProject(child.id, {
    pathwayStepId: pathway.steps[pathway.currentStepOrder - 1].id,
    targetBehaviour: 'Answer a familiar question',
  });
  const ticket = await api.studio.requestClipUpload({
    projectId: project.id,
    fileName: 'kitchen.mp4',
    contentType: 'video/mp4',
    sizeBytes: 40 * 1024 * 1024,
  });
  console.log('  upload to', ticket.uploadUrl);
  project = await api.studio.confirmClipUpload(ticket.clipId);
  project = await api.studio.startProcessing(project.id);
  await wait(2500);
  project = await api.studio.getProject(project.id);
  console.log('  after attempt 1:', project.status);
  project = await api.studio.retryProcessing(project.id);
  await wait(2800);
  project = await api.studio.getProject(project.id);
  console.log('  after retry:', project.status);
  const exported = await api.studio.exportProject(project.id);
  console.log('  exported →', exported.downloadUrl);

  log('resources');
  const resources = await api.resources.list({ audience: 'caregiver' });
  console.log('  ', resources.map((r) => r.title).join(' | '));

  log('consult — browse → availability → book → reschedule');
  const [specialist] = await api.consultations.listSpecialists();
  const avail = await api.consultations.getAvailability(specialist.id, '2026-03-01', '2026-03-31');
  const firstFree = avail.slots.find((s) => s.available)!;
  const booking = await api.consultations.createBooking(child.id, {
    specialistId: specialist.id,
    slotStart: firstFree.start,
  });
  console.log('  booked', specialist.name, 'at', booking.start);
  await api.consultations.updatePrep(booking.id, { sharedSessionLogIds: [] });

  log('safety — report a concern');
  const concern = await api.safety.reportConcern({ category: 'data_privacy', description: 'Question about clip retention.' });
  console.log('  concern', concern.id, '→', concern.status);

  console.log('\n✅ full flow completed against the mock API');
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
main().catch((e) => {
  console.error('\n❌', e);
  process.exit(1);
});
