// Password policy for accounts. The site checks the same rules (web/src/password.ts: keep both in sync).
// Supabase's minimum_password_length must equal MIN_LENGTH: its admin API refuses shorter passwords too.
export const MIN_LENGTH = 12;
const MAX_BYTES = 72; // bcrypt ignores anything after 72 bytes
const CLASSES = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u]; // lowercase, uppercase, digit, symbol (space included)
const MIN_CLASSES = 3;

/** Why this password is refused, or null when it is fine. */
export function passwordProblem(password: string, nickname: string): string | null {
  if ([...password].length < MIN_LENGTH) return `Password: at least ${MIN_LENGTH} characters`;
  if (new TextEncoder().encode(password).length > MAX_BYTES) return `Password: at most ${MAX_BYTES} characters`;
  if (CLASSES.filter(c => c.test(password)).length < MIN_CLASSES) {
    return 'Password: use 3 of lowercase, uppercase, digits, symbols';
  }
  if (nickname && password.toLowerCase().includes(nickname.toLowerCase())) return 'Password: must not contain your nickname';
  return null;
}
