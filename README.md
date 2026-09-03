# Vocal — interface layer

> The contract between the **Vocal** design prototype and the features a
> developer will build behind it.
>
> Vocal is a caregiver support tool for children with **Selective Mutism (SM)**:
> plan a graded practice pathway, log practice sessions, make self-modelling
> videos, read caregiver resources, and book specialist consultations.

This package has no UI and no server. It is the **seam**: TypeScript types,
service interfaces, a screen→API map, and a working in-memory mock so the
prototype is clickable today and the real backend can be dropped in later
without touching screen code.

Source of truth for the design: the published artifact
*"Vocal - a caregiver support tool for SM"* (Claude Design canvas, 21 screens).
Every constant here (the 6-step pathway, the 4 questionnaire questions, the 3
specialists, plan prices, upload limits) is lifted from that prototype.

> ⚠️ Product guardrails encoded in the model — keep them visible in the UI:
> Vocal supports caregiver-guided practice and **does not replace professional
> care**; a generated pathway is *"suggested — not a treatment plan"*; the
> questionnaire is *"used to personalize tools, not for diagnosis"*; nothing in
> a pathway advances automatically; videos are private by default.

---

## What's in here

| File | Purpose |
| --- | --- |
| `src/types.ts` | Domain models — `Caregiver`, `ChildProfile`, `ConsentRecord`, `Pathway`/`PathwayStep`, `SessionLog`, `VideoProject`/`VideoClip`, `Specialist`/`Booking`, `Resource`, `Subscription`, `SafetyConcern`, … |
| `src/services.ts` | **The contract.** 12 service interfaces + the aggregate `VocalAPI`, the `VocalError` type, all input payloads, and an optional `AnalyticsSink`. |
| `src/screen-map.ts` | Every prototype screen → route, nav section, `loads` (data needed on mount), `actions` (button → `VocalAPI` calls), `transitions`, and entry `guard`. Plus `ONBOARDING_FLOW`, `NAV_RAIL`, and `assertScreenMapWiring()`. |
| `src/mock/data.ts` | Seed data copied from the prototype. |
| `src/mock/mock-api.ts` | `createMockApi()` — a full in-memory `VocalAPI` with artificial latency, validation, and the "processing fails on first attempt" behaviour from the prototype. |
| `src/index.ts` | Public barrel — import from here only. |
| `scripts/check-wiring.ts` | Asserts the screen map only references real API methods. |
| `scripts/demo-flow.ts` | Runs the entire prototype flow against the mock. |

```bash
npm install
npm run typecheck      # tsc --noEmit
npm run check:wiring    # screen-map ↔ VocalAPI
npm run demo            # full flow against the mock
```

---

## How the two developers use it

### Frontend developer

Build screens against `VocalAPI` and the screen map. Never import the mock
directly — inject it.

```ts
import { createMockApi, SCREENS, type VocalAPI } from '@vocal/interface';

// one place, swapped later for the real client
export const api: VocalAPI = createMockApi({ seedSignedIn: true });
```

```tsx
// screens/PathwayStep.tsx  — spec: SCREENS.pathwayStep
function PathwayStep({ pathwayId, stepId }: Props) {
  const pathway = useQuery(['pathway', childId], () => api.pathway.getActive(childId)); // loads
  const step = pathway.data?.steps.find(s => s.id === stepId);

  return (
    <>
      {step.exercises.map(ex => (
        <Check key={ex.id} checked={ex.done}
          onChange={v => api.pathway.setExerciseDone(pathwayId, stepId, ex.id, v)} />
      ))}
      <button onClick={async () => {
        await api.pathway.completeStep(pathwayId, stepId);   // action
        navigate(SCREENS.pathway.route);                     // transition
      }}>Mark step complete</button>
    </>
  );
}
```

Error handling is uniform — everything throws `VocalError`:

```ts
try {
  await api.consent.acceptConsent(input);
} catch (e) {
  if (e instanceof VocalError && e.code === 'validation') setFieldErrors(e.fields);
  else if (e.code === 'entitlement_required') openPaywall(e.requiredEntitlement);
}
```

### Backend developer

Implement `VocalAPI` (any transport). The mock is your reference
implementation and behaviour spec — match its validation rules, its state
transitions, and its error codes. A thin adapter is all the frontend needs:

```ts
class HttpVocalApi implements VocalAPI {
  auth = new HttpAuthService(this.http);
  pathway = new HttpPathwayService(this.http);
  // …one class per interface in services.ts
}
```

Run `npm run check:wiring` in CI to catch drift between the screen map and the
contract.

---

## Screen inventory

| Section | Screens | Key services |
| --- | --- | --- |
| **Onboarding** | welcome → consent → account → childProfile → goals → goalsStep → planReview → pathway → pathwayStep → subscription | `auth`, `consent`, `child`, `goals`, `pathway`, `subscription` |
| **Home** | home | `auth.getContext`, `pathway`, `sessions` |
| **Video studio** | studioIntro → studioUpload → studioProcessing → studioPreview | `studio` |
| **Resources** | resources | `resources` |
| **Consultations** | consultBrowse → consultCalendar → consultConfirm | `consultations` |
| **Account** | sessionLog, settings, safety | `sessions`, `settings`, `auth`, `safety`, `subscription` |

`src/screen-map.ts` has the full detail for each screen.

---

## Notable behaviours the mock encodes (so the backend matches)

- **Consent gate.** `consent.acceptConsent` throws `validation` unless *both*
  flags are true. `child.create` throws `consent_required` without a consent
  record. Consent accepted before the account is created is carried onto the
  new caregiver.
- **Questionnaire → pathway.** `goals.generatePathway` requires all 4 answers,
  archives any prior draft, and stamps `generation.rulesetVersion`.
- **Manual progression.** `pathway.completeStep` is the only thing that
  advances `currentStepOrder`. `make_easier` interpolates a gentler step.
- **Video upload.** `requestClipUpload` rejects non-MP4/MOV and files over
  500 MB. Flow is request-ticket → PUT to storage → `confirmClipUpload`.
- **Processing.** Stages `reviewing_clips → separating_foreground →
  rendering`. **First attempt fails** at stage 2 (mirrors the prototype);
  `retryProcessing` succeeds.
- **Entitlements.** `studio.*` and `consultations.createBooking` require an
  entitlement; without a trial/plan they throw `entitlement_required` with
  `requiredEntitlement` set. The "continue with limited access" path leaves
  `subscription.status = 'none'` and entitlements empty.
- **Bookings.** Double-booking a slot throws `conflict`.

---

## Deliberately left open for the implementation

- Transport, auth token format, pagination style.
- Real video processing pipeline (foreground separation, prompt removal).
- The rules engine behind `goals.generatePathway` — this layer only fixes its
  inputs (`GoalQuestionnaireResponse`) and output (`Pathway` + `generation`).
- Multi-child households: types allow `children: ChildProfile[]`; the current
  design shows one.
- Settings tabs *notifications / privacy / household / billing / preferences*
  are "coming soon" in the prototype — interfaces are stubbed, screens aren't
  wired.
- i18n, notifications delivery, payment provider.
