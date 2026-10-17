import { createContext, useContext } from 'react';
import type { Api } from './api';
import type { Meta, RoleId } from './types';

export const ApiContext = createContext<Api | null>(null);
export const MetaContext = createContext<Meta | null>(null);

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

export function useRoleLabel(role: RoleId) {
  return useMeta().roles.find(r => r.id === role)?.label ?? FALLBACK_ROLE_LABEL[role] ?? role;
}
