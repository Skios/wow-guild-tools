import { useState } from 'react';
import { splitDps, type RoleTarget } from '../roleTarget';
import { RoleIcon } from './RoleIcon';

type Props = {
  initial: RoleTarget;
  busy: boolean;
  /** Why saving is off for now (unsaved roster changes would be lost on reload). */
  blocked?: string | undefined;
  onSaveEvent: (target: RoleTarget) => void;
  onSaveDefault: (target: RoleTarget) => void;
  onCancel: () => void;
};

const SIZE = 20;
const toFixed = (t: RoleTarget): RoleTarget => {
  if (t.mode === 'fixed') return t;
  const tanks = Math.min(t.tanks, SIZE);
  const healers = Math.min(4, SIZE - tanks);
  return { mode: 'fixed', size: SIZE, tanks, healers, ...splitDps(SIZE - tanks - healers, (SIZE - tanks - healers) / 2) };
};
const toFlex = (t: RoleTarget): RoleTarget => (t.mode === 'flex' ? t : { mode: 'flex', tanks: Math.min(t.tanks, 10), healersPer5: 1, meleeShare: 50 });
/** A typed value kept inside the field's range, in whole steps (an empty field is the minimum). */
const num = (value: string, min: number, max: number, step = 1) =>
  Math.min(max, Math.max(min, Math.round((Number(value) || 0) / step) * step));

/** Flex (tanks, healers per 5, a melee/ranged slider) or fixed (raid size, then counts that always add up). */
export function RoleTargetEditor({ initial, busy, blocked, onSaveEvent, onSaveDefault, onCancel }: Props) {
  const [target, setTarget] = useState(initial);
  const dps = target.mode === 'fixed' ? Math.max(0, target.size - target.tanks - target.healers) : 0;
  // Changing the size, tanks or healers keeps the melee count and gives ranged the rest.
  const fixed = (change: Partial<Extract<RoleTarget, { mode: 'fixed' }>>) => setTarget(t => {
    if (t.mode !== 'fixed') return t;
    const next = { ...t, ...change };
    return { ...next, ...splitDps(Math.max(0, next.size - next.tanks - next.healers), next.melee) };
  });
  const flex = (change: Partial<Extract<RoleTarget, { mode: 'flex' }>>) => setTarget(t => (t.mode === 'flex' ? { ...t, ...change } : t));
  // 0 while the size is being retyped; saving needs at least 1.
  const valid = target.mode === 'flex' || (target.size >= 1 && target.tanks + target.healers <= target.size);
  const off = busy || !valid || blocked !== undefined;

  return (
    <form className="stack" aria-label="Role target" onSubmit={e => { e.preventDefault(); if (!off) onSaveEvent(target); }}>
      <div role="radiogroup" aria-label="Mode" className="actions">
        <label className="check"><input type="radio" name="mode" checked={target.mode === 'flex'} onChange={() => setTarget(toFlex)} /> Flex</label>
        <label className="check"><input type="radio" name="mode" checked={target.mode === 'fixed'} onChange={() => setTarget(toFixed)} /> Fixed</label>
        <span className="muted">{target.mode === 'flex' ? 'Grows with the confirmed players.' : 'A set raid size.'}</span>
      </div>

      {target.mode === 'flex' ? (
        <div className="grid">
          <div><label htmlFor="rt-tanks">Tanks</label><input id="rt-tanks" type="number" min={0} max={10} value={target.tanks} onChange={e => flex({ tanks: num(e.target.value, 0, 10) })} /></div>
          <div><label htmlFor="rt-per5">Healers per 5 people</label><input id="rt-per5" type="number" min={0} max={5} step={0.5} value={target.healersPer5} onChange={e => flex({ healersPer5: num(e.target.value, 0, 5, 0.5) })} /></div>
          <div className="span-2 dps-split">
            <RoleIcon role="DPS" />
            <input aria-label="Melee share" type="range" min={0} max={100} step={5} value={target.meleeShare}
              aria-valuetext={`${target.meleeShare}% melee, ${100 - target.meleeShare}% ranged`} onChange={e => flex({ meleeShare: num(e.target.value, 0, 100) })} />
            <RoleIcon role="RANGED_DPS" />
            <span className="muted">{target.meleeShare}% melee · {100 - target.meleeShare}% ranged</span>
          </div>
        </div>
      ) : (
        <div className="grid">
          <div><label htmlFor="rt-size">Raid size</label><input id="rt-size" type="number" min={1} max={40} value={target.size} onChange={e => fixed({ size: num(e.target.value, 0, 40) })} /></div>
          <div><label htmlFor="rt-tanks">Tanks</label><input id="rt-tanks" type="number" min={0} max={40} value={target.tanks} onChange={e => fixed({ tanks: num(e.target.value, 0, 40) })} /></div>
          <div><label htmlFor="rt-healers">Healers</label><input id="rt-healers" type="number" min={0} max={40} value={target.healers} onChange={e => fixed({ healers: num(e.target.value, 0, 40) })} /></div>
          <div className="span-2 dps-split">
            <span>{dps} DPS</span>
            <RoleIcon role="DPS" />
            <label htmlFor="rt-melee" className="sr-only">Melee</label>
            <input id="rt-melee" type="number" min={0} max={dps} value={target.melee} onChange={e => fixed({ melee: num(e.target.value, 0, dps) })} />
            {/* The same value as the Melee box, to drag: hidden from screen readers and Tab so it isn't read twice. */}
            <input aria-hidden="true" tabIndex={-1} type="range" min={0} max={dps} value={target.melee} onChange={e => fixed({ melee: num(e.target.value, 0, dps) })} />
            <label htmlFor="rt-ranged" className="sr-only">Ranged</label>
            <input id="rt-ranged" type="number" min={0} max={dps} value={target.ranged} onChange={e => fixed({ melee: dps - num(e.target.value, 0, dps) })} />
            <RoleIcon role="RANGED_DPS" />
          </div>
          {!valid && <p role="alert" className="error span-2">{target.size < 1 ? 'Set the raid size.' : 'Tanks and healers are more than the raid size.'}</p>}
        </div>
      )}

      {blocked && <p className="muted" id="rt-blocked">{blocked}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={off} aria-describedby={blocked ? 'rt-blocked' : undefined}>Save for this event</button>
        <button type="button" disabled={off} aria-describedby={blocked ? 'rt-blocked' : undefined} onClick={() => onSaveDefault(target)}>Save as guild default</button>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
