import { createContext, useContext } from 'react';
import type { Api } from './api';
import type { AuthClient } from './auth';
import { DEFAULT_PREFS, type Prefs } from './theme';
import type { Meta, Officer, RoleId } from './types';

export const ApiContext = createContext<Api | null>(null);
export const MetaContext = createContext<Meta | null>(null);
export const PrefsContext = createContext<Prefs>(DEFAULT_PREFS);
export const OfficerContext = createContext<Officer | null>(null);
export const AuthContext = createContext<AuthClient | null>(null);

/** The sign-in client (provided by the app shell): pages that sign in again after a password change. */
export function useAuth(): AuthClient {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthContext is missing');
  return auth;
}

/** The signed-in account (provided by the app shell). */
export function useOfficer(): Officer {
  const officer = useContext(OfficerContext);
  if (!officer) throw new Error('OfficerContext is missing');
  return officer;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('ApiContext is missing');
  return api;
}

export function useMeta(): Meta {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error('MetaContext is missing');
  return meta;
}

export const UNKNOWN_CLASS_COLOR = '#9CA3AF';

const FALLBACK_ROLE_LABEL: Record<RoleId, string> = {
  TANK: 'Tank',
  HEALER: 'Healer',
  DPS: 'Melee DPS',
  RANGED_DPS: 'Ranged DPS',
};

/** Colour and label for a class, tolerating classes the server added after this build. */
export function useClassInfo(classId: string) {
  const info = useMeta().classes.find(c => c.id === classId);
  return { color: info?.color ?? UNKNOWN_CLASS_COLOR, label: info?.label ?? classId };
}

const roleLabel = (meta: Meta, role: RoleId) => meta.roles.find(r => r.id === role)?.label ?? FALLBACK_ROLE_LABEL[role] ?? role;

export function useRoleLabel(role: RoleId) {
  return roleLabel(useMeta(), role);
}

/** Label of a specialization ("Fire"), if the server knows it. */
export function useSpecLabel(classId: string, spec: string | null): string | undefined {
  const info = useMeta().classes.find(c => c.id === classId);
  return spec ? info?.specs.find(s => s.id === spec)?.label : undefined;
}

/** Label and role of any spec of a class; an id the server added after this build comes back as itself, with no role. */
export function useSpecInfo(classId: string) {
  const meta = useMeta();
  const specs = meta.classes.find(c => c.id === classId)?.specs ?? [];
  return (id: string): { label: string; role: RoleId | null; roleLabel: string | null } => {
    const spec = specs.find(s => s.id === id);
    return { label: spec?.label ?? id, role: spec?.role ?? null, roleLabel: spec ? roleLabel(meta, spec.role) : null };
  };
}

export const useIconStyle = () => useContext(PrefsContext).icons;
