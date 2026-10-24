// Times in bot messages, in the guild's time zone with the zone shown ("Sun 18 Oct, 21:00 CEST").
const DEFAULT_TIME_ZONE = 'Europe/Rome';

export const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** GUILD_TIME_ZONE (checked at startup in config/env.ts), else Europe/Rome. */
export const guildTimeZone = () => {
  const zone = process.env.GUILD_TIME_ZONE;
  return zone && isTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;
};

export function formatStart(date: Date, timeZone: string = guildTimeZone()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}
