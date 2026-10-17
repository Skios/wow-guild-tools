import type { Meta, RosterEntryInput } from './types';

export interface RosterFormValues {
  name: string;
  realm: string;
  class: string;
  spec: string;
}

export type RosterFormField = keyof RosterFormValues;

export interface RosterFormResult {
  errors: Partial<Record<RosterFormField, string>>;
  payload: RosterEntryInput | null;
}

// Same rules as the API: names are 2-12 letters, realms allow spaces, apostrophes, hyphens and parentheses.
const NAME = /^\p{L}{2,12}$/u;
const REALM = /^[\p{L}\p{N} '’()-]{2,40}$/u;

export function validateRosterEntry(values: RosterFormValues, meta: Meta): RosterFormResult {
  const errors: RosterFormResult['errors'] = {};
  const name = values.name.trim();
  const realm = values.realm.trim();
  const chosen = meta.classes.find(c => c.id === values.class);

  if (!NAME.test(name)) errors.name = 'Names are 2 to 12 letters';
  if (!REALM.test(realm)) errors.realm = 'Enter a valid realm name';
  if (!chosen) errors.class = 'Choose a class';
  else if (!chosen.specs.some(s => s.id === values.spec)) errors.spec = `Choose a ${chosen.label} specialization`;

  if (Object.keys(errors).length > 0) return { errors, payload: null };
  return { errors, payload: { name, realm, class: values.class, spec: values.spec } };
}
