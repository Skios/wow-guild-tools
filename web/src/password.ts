// Same rules as the API (src/domain/password.ts: keep both in sync, the tests are the same file).
export const MIN_LENGTH = 12;
const MAX_BYTES = 72; // bcrypt ignores anything after 72 bytes
const CLASSES = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u]; // lowercase, uppercase, digit, symbol (space included)
const MIN_CLASSES = 3;

type Rule = { label: string; problem: string; ok: (password: string, nickname: string) => boolean };

/** The rules as the site shows them (a checklist that ticks while typing). */
export const PASSWORD_RULES: readonly Rule[] = [
  { label: `At least ${MIN_LENGTH} characters`, problem: `Password: at least ${MIN_LENGTH} characters`, ok: p => [...p].length >= MIN_LENGTH },
  {
    label: '3 of: lowercase, uppercase, digits, symbols', problem: 'Password: use 3 of lowercase, uppercase, digits, symbols',
    ok: p => CLASSES.filter(c => c.test(p)).length >= MIN_CLASSES,
  },
  {
    label: 'Not containing your nickname', problem: 'Password: must not contain your nickname',
    ok: (p, nickname) => !nickname || !p.toLowerCase().includes(nickname.toLowerCase()),
  },
];

/** Why this password is refused, or null when it is fine. */
export function passwordProblem(password: string, nickname: string): string | null {
  const [length, ...others] = PASSWORD_RULES;
  if (!length!.ok(password, nickname)) return length!.problem;
  if (new TextEncoder().encode(password).length > MAX_BYTES) return `Password: at most ${MAX_BYTES} characters`;
  return others.find(rule => !rule.ok(password, nickname))?.problem ?? null;
}
