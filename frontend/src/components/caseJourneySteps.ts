// Shared step copy for every "journey" visualization of a case's progress —
// the public case tracker (by tracking-code link) and the account incident
// page's family/friend view. Keeping this in one place means the two can
// never drift out of sync with each other or with the backend's own
// STEP_DEFINITIONS (app/features/incidents/tracker_service.py), which this
// mirrors.

export interface CaseStepDef {
  step: number;
  title: string;
  subtitle: string;
  icon: string;
}

export const CASE_JOURNEY_STEPS: CaseStepDef[] = [
  { step: 1, title: 'Request Received',              subtitle: 'We are with you.',                                                             icon: '◉' },
  { step: 2, title: 'Situation Assessment',           subtitle: 'We are reviewing what happened and how urgent it is.',                         icon: '◈' },
  { step: 3, title: 'Critical Information Verified',  subtitle: 'Identity, location, status, and contact details are being confirmed.',         icon: '✦' },
  { step: 4, title: 'Case Officer Assigned',          subtitle: 'A dedicated person is managing the case.',                                     icon: '◎' },
  { step: 5, title: 'Response Network Activated',     subtitle: 'The right people are being connected.',                                        icon: '⊕' },
  { step: 6, title: 'Action Plan in Motion',          subtitle: 'The required steps are underway.',                                             icon: '▸' },
  { step: 7, title: "Person's Status Verified",       subtitle: 'The family receives a clear and personal update.',                             icon: '◇' },
  { step: 8, title: 'Support & Next Steps',           subtitle: 'We continue supporting the family through the next steps.',                    icon: '♡' },
];

export const CASE_JOURNEY_STEPS_SENSITIVE: CaseStepDef[] = [
  ...CASE_JOURNEY_STEPS.slice(0, 6),
  { step: 7, title: 'Family Notified with Care',    subtitle: 'The family has been updated personally and with care.', icon: '◇' },
  { step: 8, title: 'Family Support & Next Steps',  subtitle: 'We continue supporting the family through the next steps.', icon: '♡' },
];

export type JourneyStepState = 'complete' | 'active' | 'upcoming';

export function journeyStepState(def: CaseStepDef, current: number): JourneyStepState {
  if (def.step < current) return 'complete';
  if (def.step === current) return 'active';
  return 'upcoming';
}
