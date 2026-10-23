'use client';

import { useState, type FormEvent } from 'react';
import { useApi, useAuth, useSpecLabel } from '../context';
import type { MyCharacter } from '../types';
import { errorMessage, useAsync } from '../useAsync';
import { ChangePassword } from './ChangePassword';
import { PencilIcon, XIcon } from './icons';
import { CharacterName } from './CharacterName';
import { OffSpecs } from './OffSpecs';
import { RosterForm } from './RosterForm';
import { TelegramCard } from './TelegramCard';

const CHANNEL_LABEL: Record<string, string> = { telegram: 'Telegram' };

function CharacterRow({ character, busy, onEdit, onRemove }: {
  character: MyCharacter; busy: boolean; onEdit: () => void; onRemove: () => void;
}) {
  const spec = useSpecLabel(character.class, character.spec);
  const [confirming, setConfirming] = useState(false);
  return (
    <tr>
      <td>
        <span className="role-cell">
          <CharacterName name={character.name} classId={character.class} />
          <span className="muted">{spec}</span>
          <OffSpecs classId={character.class} offSpecs={character.offSpecs} />
        </span>
      </td>
      <td className="muted">{character.realm}</td>
      <td>
        {character.isMain && <span className="badge badge-published">Main</span>}
        {!character.inRoster && <span className="badge badge-open" title="It joins the roster once an officer approves it">Waiting for an officer</span>}
      </td>
      <td className="cell-actions">
        {confirming ? (
          <span className="actions compact">
            <button type="button" className="danger" disabled={busy} onClick={onRemove}>Confirm remove</button>
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </span>
        ) : (
          <span className="actions compact">
            <button type="button" className="icon-button" disabled={busy} onClick={onEdit} aria-label={`Edit ${character.name}`} title="Edit"><PencilIcon /></button>
            <button type="button" className="icon-button" disabled={busy} onClick={() => setConfirming(true)} aria-label={`Remove ${character.name}`} title="Remove"><XIcon /></button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Specs (name, realm and class stay as the game spells them) and, for an alt, "Make main". */
function EditCharacter({ character, busy, onSave, onMain, onClose }: {
  character: MyCharacter; busy: boolean;
  onSave: (specs: { spec: string; offSpecs: string[] }) => Promise<void>; onMain: () => void; onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-label={`Edit ${character.name}`} className="modal stack">
        <h2>{character.name}</h2>
        <RosterForm
          lockIdentity hideNickname submitLabel="Save specs" onCancel={onClose}
          initial={{ name: character.name, realm: character.realm, class: character.class, spec: character.spec ?? '', offSpecs: character.offSpecs, nickname: '' }}
          onSubmit={entry => onSave({ spec: entry.spec, offSpecs: entry.offSpecs })}
        />
        {!character.isMain && (
          <div className="stack">
            <p className="muted">The main answers events from Telegram by default.</p>
            <div><button type="button" disabled={busy} onClick={onMain}>Make main</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Your profile: summary, characters, channels, password. */
export function ProfileView() {
  const api = useApi();
  const auth = useAuth();
  const profile = useAsync(() => api.profile(), [api]);
  const claimable = useAsync(() => api.claimable(), [api]);
  const [nickname, setNickname] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyCharacter | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      profile.reload();
      claimable.reload();
    } catch (failure) {
      setError(errorMessage(failure));
    }
    setBusy(false);
  }

  if (profile.error) return <p role="alert" className="error">Could not load your profile: {profile.error} <button type="button" onClick={profile.reload}>Retry</button></p>;
  if (!profile.data) return <p className="muted" role="status">Loading…</p>;
  const me = profile.data;
  const shownNickname = nickname ?? me.nickname ?? '';

  const saveNickname = (event: FormEvent) => {
    event.preventDefault();
    void act(() => api.setNickname(shownNickname.trim() || null), 'Nickname saved.');
  };
  const sendResetLink = async () => {
    setResetNotice(null);
    try {
      await api.sendResetLink();
      setResetNotice('A reset link was sent to your Telegram (valid 15 minutes).');
    } catch (failure) {
      setResetNotice(errorMessage(failure));
    }
  };

  return (
    <div className="stack profile">
      <section className="card stack">
        <div className="profile-head">
          <h1>{me.username}</h1>
          {me.role && <span className="badge">{me.role}</span>}
        </div>
        <form className="inline-form" onSubmit={saveNickname}>
          <div>
            <label htmlFor="profile-nickname">Nickname</label>
            <input id="profile-nickname" value={shownNickname} maxLength={24} onChange={e => setNickname(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}>Save nickname</button>
        </form>
        <p className="muted">What the guild calls you: shown next to your characters in the roster and on events.</p>
      </section>

      {notice && <p role="status" className="notice">{notice}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <section className="card stack">
        <h2>Characters</h2>
        {me.characters.length === 0 && <p className="muted">No characters yet: claim your name below or add one.</p>}
        {me.characters.length > 0 && (
          <table className="table">
            <thead>
              <tr><th scope="col">Character</th><th scope="col">Realm</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {me.characters.map(c => (
                <CharacterRow
                  key={c.id} character={c} busy={busy}
                  onEdit={() => { setAdding(false); setEditing(c); }}
                  onRemove={() => void act(() => api.removeMyCharacter(c.id))}
                />
              ))}
            </tbody>
          </table>
        )}
        {editing && (
          <EditCharacter
            key={editing.id} character={editing} busy={busy} onClose={() => setEditing(null)}
            onSave={async specs => {
              await api.updateMyCharacter(editing.id, specs);
              setEditing(null);
              profile.reload();
            }}
            onMain={() => { setEditing(null); void act(() => api.setMainCharacter(editing.id), `${editing.name} is now your main.`); }}
          />
        )}

        {(claimable.data?.length ?? 0) > 0 && (
          <>
            <h3>Roster names nobody has claimed</h3>
            <table className="table">
              <tbody>
                {claimable.data!.map(c => (
                  <tr key={c.id}>
                    <td><CharacterName name={c.name} classId={c.class} /></td>
                    <td className="muted">{c.realm}</td>
                    <td className="cell-actions">
                      <button type="button" disabled={busy} onClick={() => void act(() => api.claimCharacter(c.id), `${c.name} is now yours.`)}>It&apos;s mine</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {adding ? (
          <>
            <p className="muted">Start typing the name: guild members and Raider.IO suggest the exact spelling. A new character joins the roster once an officer approves it.</p>
            <RosterForm
              hideNickname submitLabel="Add character" suggest={api.searchCharacters} onCancel={() => setAdding(false)}
              initial={{ name: '', realm: '', class: '', spec: '', offSpecs: [], nickname: '' }}
              onSubmit={async entry => {
                await api.addMyCharacter(entry);
                setAdding(false);
                setNotice(`${entry.name} added: an officer will approve it for the roster.`);
                profile.reload();
              }}
            />
          </>
        ) : (
          <div><button type="button" onClick={() => { setEditing(null); setAdding(true); }}>Add a character</button></div>
        )}
      </section>

      <section className="card stack">
        <h2>Channels</h2>
        <p>Preferred channel: {CHANNEL_LABEL[me.preferredChannel ?? ''] ?? 'none'}. Officers' messages arrive there.</p>
        <TelegramCard username={me.username} />
      </section>

      <section className="card stack">
        <h2>Password</h2>
        <div><button type="button" onClick={() => { setResetNotice(null); setPasswordOpen(true); }}>Change password</button></div>
      </section>

      {passwordOpen && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-label="Change password" className="modal stack">
            <ChangePassword auth={auth} username={me.username} forced={false} onDone={() => { setPasswordOpen(false); setNotice('Password changed.'); }} />
            {me.channels.telegram && (
              <div className="stack">
                <p className="muted">Forgot the current one? Get a reset link on Telegram instead.</p>
                <div><button type="button" onClick={() => void sendResetLink()}>Send me a reset link on Telegram</button></div>
                {resetNotice && <p role="status">{resetNotice}</p>}
              </div>
            )}
            <div><button type="button" onClick={() => setPasswordOpen(false)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
