import { PASSWORD_RULES } from '../password';

/** The password rules, ticking as they are met. */
export function PasswordChecklist({ password, nickname }: { password: string; nickname: string }) {
  return (
    <ul className="checklist" aria-label="Password rules" aria-live="polite">
      {PASSWORD_RULES.map(rule => {
        const ok = rule.ok(password, nickname.trim().toLowerCase());
        return (
          <li key={rule.label} data-ok={ok}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span> {rule.label}<span className="sr-only">{ok ? ': done' : ': not yet'}</span>
          </li>
        );
      })}
    </ul>
  );
}
