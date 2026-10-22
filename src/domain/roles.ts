import type { SiteRole } from '@prisma/client';
import { AppError } from '../lib/errors.js';

// What a route may require. Routes ask for a capability, never for a role.
// Add one only together with the route that needs it.
export const CAPABILITIES = ['roster.manage', 'events.manage', 'messages.send', 'admin'] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Record<SiteRole, readonly Capability[]> = {
  OWNER: CAPABILITIES,
  OFFICER: ['roster.manage', 'events.manage', 'messages.send'],
};

const ROLES: readonly SiteRole[] = ['OWNER', 'OFFICER'];

export const capabilitiesOf = (role: SiteRole | null): Capability[] => (role ? [...ROLE_CAPABILITIES[role]] : []);

export function parseRole(raw: unknown): SiteRole {
  const role = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if ((ROLES as string[]).includes(role)) return role as SiteRole;
  throw new AppError(`Unknown role: use ${ROLES.join(' or ').toLowerCase()}`, 400);
}
