/**
 * Recipient Timezone Calculation and Send Window Evaluator
 */

const CITY_TIMEZONE_MAP: Record<string, string> = {
  // United States & Canada
  'new york': 'America/New_York',
  nyc: 'America/New_York',
  brooklyn: 'America/New_York',
  boston: 'America/New_York',
  miami: 'America/New_York',
  atlanta: 'America/New_York',
  orlando: 'America/New_York',
  philadelphia: 'America/New_York',
  chicago: 'America/Chicago',
  houston: 'America/Chicago',
  dallas: 'America/Chicago',
  austin: 'America/Chicago',
  denver: 'America/Denver',
  boulder: 'America/Denver',
  phoenix: 'America/Phoenix',
  'los angeles': 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  sf: 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  portland: 'America/Los_Angeles',
  toronto: 'America/Toronto',
  vancouver: 'America/Vancouver',

  // India
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata',
  hyderabad: 'Asia/Kolkata',
  chennai: 'Asia/Kolkata',
  pune: 'Asia/Kolkata',
  kolkata: 'Asia/Kolkata',
  ahmedabad: 'Asia/Kolkata',
  india: 'Asia/Kolkata',

  // UK & Europe
  london: 'Europe/London',
  manchester: 'Europe/London',
  birmingham: 'Europe/London',
  uk: 'Europe/London',
  paris: 'Europe/Paris',
  berlin: 'Europe/Berlin',
  amsterdam: 'Europe/Amsterdam',

  // Australia & Asia
  sydney: 'Australia/Sydney',
  melbourne: 'Australia/Melbourne',
  brisbane: 'Australia/Brisbane',
  singapore: 'Asia/Singapore',
  dubai: 'Asia/Dubai',
};

/**
 * Resolves the recipient IANA timezone from explicit timezone, metadata, location, or country
 */
export function resolveRecipientTimezone(
  explicitTz?: string | null,
  location?: string | null,
  country?: string | null,
  fallbackTz: string = 'UTC'
): string {
  if (explicitTz && isValidIanaTimezone(explicitTz.trim())) {
    return explicitTz.trim();
  }

  const loc = (location || '').toLowerCase();
  for (const [key, tz] of Object.entries(CITY_TIMEZONE_MAP)) {
    if (loc.includes(key)) {
      return tz;
    }
  }

  const c = (country || '').toLowerCase();
  for (const [key, tz] of Object.entries(CITY_TIMEZONE_MAP)) {
    if (c.includes(key)) {
      return tz;
    }
  }

  return isValidIanaTimezone(fallbackTz) ? fallbackTz : 'UTC';
}

function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface WindowCheckResult {
  inWindow: boolean;
  recipientTz: string;
  localHour: number;
  localDay: number; // 0 = Sunday, 6 = Saturday
  localTimeStr: string;
  reason?: string;
}

/**
 * Checks whether a given Date is within the recipient's local business send window
 * Default: 09:00 - 17:00 recipient local time, Monday-Friday
 */
export function isWithinRecipientWindow(
  now: Date,
  timezone: string,
  startHour: number = 9,
  endHour: number = 17,
  weekdaysOnly: boolean = true
): WindowCheckResult {
  const recipientTz = isValidIanaTimezone(timezone) ? timezone : 'UTC';

  // Format parts in target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: recipientTz,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value;
  const minutePart = parts.find((p) => p.type === 'minute')?.value;
  const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;

  const localHour = parseInt(hourPart || '0', 10);
  const localMinute = parseInt(minutePart || '0', 10);

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const localDay = dayMap[weekdayPart || 'Mon'] ?? 1;
  const isWeekend = localDay === 0 || localDay === 6;
  const localTimeStr = `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')} ${weekdayPart || ''} (${recipientTz})`;

  // 24/7 Send Window: When startHour=0, endHour>=24, and weekdaysOnly=false, sending is permitted at any time
  if (startHour === 0 && endHour >= 24 && !weekdaysOnly) {
    return {
      inWindow: true,
      recipientTz,
      localHour,
      localDay,
      localTimeStr,
    };
  }

  if (weekdaysOnly && isWeekend) {
    return {
      inWindow: false,
      recipientTz,
      localHour,
      localDay,
      localTimeStr,
      reason: `Outside recipient window: Weekend resting (${weekdayPart} in ${recipientTz})`,
    };
  }

  if (localHour < startHour || localHour >= endHour) {
    return {
      inWindow: false,
      recipientTz,
      localHour,
      localDay,
      localTimeStr,
      reason: `Outside recipient window: Local time is ${localTimeStr}, allowed window is ${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`,
    };
  }

  return {
    inWindow: true,
    recipientTz,
    localHour,
    localDay,
    localTimeStr,
  };
}

