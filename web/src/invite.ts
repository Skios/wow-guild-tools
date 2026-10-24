/** WoW macros hold at most 255 bytes (UTF-8: an accented letter takes two). */
export const MACRO_LIMIT = 255;

/** `/invite Name-Realm` lines, packed into as few macros as fit; the game writes realms without spaces or dashes.
 *  ponytail: a single line over the limit can't happen (names 12 letters, realms ~25). */
const bytes = (text: string) => new TextEncoder().encode(text).length;

export function inviteMacros(characters: { name: string; realm: string }[]): string[] {
  const macros: string[] = [];
  for (const { name, realm } of characters) {
    const line = `/invite ${name}-${realm.replace(/[\s-]/g, '')}`;
    const last = macros.at(-1);
    if (last !== undefined && bytes(`${last}\n${line}`) <= MACRO_LIMIT) macros[macros.length - 1] = `${last}\n${line}`;
    else macros.push(line);
  }
  return macros;
}
