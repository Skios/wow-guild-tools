import type { ReactNode } from 'react';
import { useRoleLabel } from '../context';
import type { RoleId } from '../types';

const PATHS: Record<RoleId, ReactNode> = {
  TANK: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />,
  HEALER: <path d="M12 5v14M5 12h14" />,
  DPS: <path d="M4 20 20 4M8 12l4 4M4 20l2.5-2.5" />,
  RANGED_DPS: <path d="M6 4c8 2 8 14 0 16M6 12h14M16 8l4 4-4 4" />,
};

export function RoleIcon({ role }: { role: RoleId }) {
  const label = useRoleLabel(role);
  return (
    <svg
      className={`role-icon role-${role.toLowerCase()}`}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {PATHS[role]}
    </svg>
  );
}
