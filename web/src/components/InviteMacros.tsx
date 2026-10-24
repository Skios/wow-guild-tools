import { useState } from 'react';
import { inviteMacros } from '../invite';

const BY_HAND = 'Could not copy. Select the text and copy it by hand.';

/** The roster as in-game macros: paste one into a macro and run it to invite everyone in it. */
export function InviteMacros({ people }: { people: { name: string; realm: string }[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const macros = inviteMacros(people);
  if (macros.length === 0) return null;

  const copy = async (macro: string, label: string) => {
    // Read before writing, so a second copy of the same macro is announced again.
    setCopied(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(macro);
      setCopied(`${label} copied.`);
    } catch {
      setCopied(BY_HAND);
    }
  };

  return (
    <section className="card" aria-label="In-game invites">
      <h3>In-game invites</h3>
      <p className="muted">Paste each into a macro (Esc → Macros) and run it. A macro holds at most 255 characters, so big rosters need more than one.</p>
      {macros.map((macro, i) => {
        const label = `Macro ${i + 1}`;
        return (
          <div key={label} className="stack">
            <label htmlFor={`invite-${i}`}>{label}</label>
            <textarea id={`invite-${i}`} readOnly value={macro} rows={macro.split('\n').length} onFocus={e => e.target.select()} />
            <span className="actions"><button type="button" onClick={() => copy(macro, label)} aria-label={`Copy ${label.toLowerCase()}`}>Copy</button></span>
          </div>
        );
      })}
      {/* Always mounted: screen readers announce changes to a live region that already exists. */}
      <p className={copied ? 'notice' : undefined} role="status">{copied}</p>
    </section>
  );
}
