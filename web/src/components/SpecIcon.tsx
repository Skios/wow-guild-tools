import { useState } from 'react';
import { useClassInfo, useIconStyle, useSpecLabel } from '../context';
import type { RoleId } from '../types';
import { RoleIcon } from './RoleIcon';

interface Props {
  classId: string;
  spec: string | null;
  role: RoleId;
  size?: number;
}

/** Specialization icon, following the chosen icon style, with the role icon as a safety net. */
export function SpecIcon({ classId, spec, role, size = 24 }: Props) {
  const style = useIconStyle();
  const { label: className } = useClassInfo(classId);
  const specLabel = useSpecLabel(classId, spec);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const slug = classId.toLowerCase();
  const src = spec ? `/icons/spec/${slug}-${spec.toLowerCase()}.jpg` : `/icons/class/${slug}.jpg`;

  if (style === 'none') return null;
  if (style === 'line' || brokenSrc === src) return <RoleIcon role={role} />;
  return (
    <img
      className="spec-icon"
      src={src}
      alt={[specLabel, className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      onError={() => setBrokenSrc(src)}
    />
  );
}
