import type { Meta, RosterEntryInput } from './types';

export interface RosterFormValues {
  name: string;
  realm: string;
  class: string;
  spec: string;
  /** Ordered: 2nd spec first. */
  offSpecs: string[];
  nickname: string;
}

export type RosterFormField = keyof RosterFormValues;

export interface RosterFormResult {
  errors: Partial<Record<RosterFormField, string>>;
  payload: RosterEntryInput | null;
}

// Same rules as the API: names are 2-12 letters, realms allow spaces, apostrophes, hyphens and parentheses.
const NAME = /^\p{L}{2,12}$/u;
const NICKNAME = /^[\p{L}\p{N} ._'-]{1,24}$/u;
const REALM = /^[\p{L}\p{N} '’()-]{2,40}$/u;

export function validateRosterEntry(values: RosterFormValues, meta: Meta): RosterFormResult {
  const errors: RosterFormResult['errors'] = {};
  const name = values.name.trim();
  const realm = values.realm.trim();
  const nickname = values.nickname.trim();
  const chosen = meta.classes.find(c => c.id === values.class);

  if (!NAME.test(name)) errors.name = 'Names are 2 to 12 letters';
  if (!REALM.test(realm)) errors.realm = 'Enter a valid realm name';
  if (!chosen) errors.class = 'Choose a class';
  else if (!chosen.specs.some(s => s.id === values.spec)) errors.spec = `Choose a ${chosen.label} specialization`;

  if (nickname && !NICKNAME.test(nickname)) errors.nickname = "Up to 24 letters, digits, spaces or . _ ' -";
  if (chosen && values.offSpecs.some((id, i) => id === values.spec || values.offSpecs.indexOf(id) !== i || !chosen.specs.some(s => s.id === id))) {
    errors.offSpecs = `Off-specs must be different ${chosen.label} specializations, not the main one`;
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };
  return { errors, payload: { name, realm, class: values.class, spec: values.spec, offSpecs: [...values.offSpecs], nickname: nickname || null } };
}

/** A copy of the list with the item at `index` swapped with its neighbour (`-1` up, `1` down). */
export function moveItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}
