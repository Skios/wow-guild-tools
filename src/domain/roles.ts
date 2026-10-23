// Roles live in the "roles" table and are configured by the Owner. Routes ask for a capability, never a role.
//
// Capabilities come from the code: requireCapability('roster.manage') registers the name where the route
// declares it, and the Roles page offers exactly that list. Renaming one needs a migration that updates the
// roles holding it: UPDATE "roles" SET "capabilities" = array_replace("capabilities", 'old', 'new');
// (src/app.test.ts replays the migrations and fails if a stored capability no longer exists in the code).

export type SiteRole = { name: string; position: number; capabilities: string[]; isOwner: boolean };

const CAPABILITY = /^[a-z]+(\.[a-z]+)+$/;
const registered = new Set<string>();

export function registerCapability(name: string): string {
  if (!CAPABILITY.test(name)) throw new Error(`Bad capability name "${name}": use lowercase words joined by dots, e.g. roster.manage`);
  registered.add(name);
  return name;
}

export const knownCapabilities = (): string[] => [...registered].sort();
export const isKnownCapability = (name: string): boolean => registered.has(name);

/** The Owner has everything; any other role only what the code still knows (a stale name grants nothing). */
export const capabilitiesOf = (role: SiteRole): string[] =>
  role.isOwner ? knownCapabilities() : role.capabilities.filter(isKnownCapability).sort();

type Holder = { userId: string; role: SiteRole | null };

/**
 * Why `actor` may not give `next` to `target`, or null if allowed. Lower position = higher rank.
 * The Owner may change anyone but themselves; everyone else only people below them, to a role equal to
 * or below their own and whose capabilities they all have. Whether the actor may manage accounts at all is
 * the route's capability check.
 */
export function roleChangeProblem(actor: Holder & { role: SiteRole }, target: Holder, next: SiteRole): string | null {
  if (actor.userId === target.userId) return 'You cannot change your own role';
  if (actor.role.isOwner) return null;
  if (target.role && (target.role.isOwner || target.role.position <= actor.role.position)) {
    return 'You can only change the role of someone below you';
  }
  if (next.isOwner || next.position < actor.role.position) return 'You can only give a role equal to or below yours';
  // A lower role can still hold a capability the actor lacks: giving it would hand out a power they don't have.
  const mine = capabilitiesOf(actor.role);
  if (capabilitiesOf(next).some(c => !mine.includes(c))) return 'You can only give a role whose capabilities you have';
  return null;
}
