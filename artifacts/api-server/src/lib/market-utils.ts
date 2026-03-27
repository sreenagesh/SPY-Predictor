export type MarketStatus = "open" | "premarket" | "afterhours" | "closed";

function getEdtOffset(date: Date): number {
  const month = date.getUTCMonth(); // 0-indexed
  const day = date.getUTCDate();
  // DST (EDT, UTC-4): 2nd Sunday of March through 1st Sunday of November
  if (month > 2 && month < 10) return 4;
  if (month === 2 && day >= 8) return 4; // after ~2nd Sunday of March
  if (month === 10 && day < 7) return 4; // before ~1st Sunday of November
  return 5; // EST (UTC-5)
}

export function getMarketStatus(date = new Date()): MarketStatus {
  const day = date.getUTCDay(); // 0=Sunday, 6=Saturday
  if (day === 0 || day === 6) return "closed";

  const offset = getEdtOffset(date);
  const localMinutes =
    ((date.getUTCHours() - offset + 24) % 24) * 60 + date.getUTCMinutes();

  const PREMARKET_OPEN = 4 * 60;       // 4:00 AM
  const MARKET_OPEN    = 9 * 60 + 30;  // 9:30 AM
  const MARKET_CLOSE   = 16 * 60;      // 4:00 PM
  const AH_CLOSE       = 20 * 60;      // 8:00 PM

  if (localMinutes >= MARKET_OPEN && localMinutes < MARKET_CLOSE) return "open";
  if (localMinutes >= PREMARKET_OPEN && localMinutes < MARKET_OPEN) return "premarket";
  if (localMinutes >= MARKET_CLOSE && localMinutes < AH_CLOSE) return "afterhours";
  return "closed";
}

export function secondsUntilNextFiveMinBar(): number {
  const now = new Date();
  const secondsIntoCurrentMinute = now.getSeconds();
  const minutesPastFiveMinMark = now.getMinutes() % 5;
  return (4 - minutesPastFiveMinMark) * 60 + (60 - secondsIntoCurrentMinute);
}

export function getNextTradingDate(): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

export function formatExpiry(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function getNextDates(targetDte: number, count = 4): Date[] {
  const now = new Date();
  const dates: Date[] = [];
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  while (dates.length < count) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) dates.push(new Date(d));
  }
  return dates;
}

/** Calendar-day difference — strips time so Friday→Friday = 0, Friday→Monday = 3 */
export function daysUntil(date: Date): number {
  const nowDay = new Date();
  nowDay.setUTCHours(0, 0, 0, 0);
  const targetDay = new Date(date);
  targetDay.setUTCHours(0, 0, 0, 0);
  return Math.round((targetDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24));
}

/** Trading-day count (skips weekends) — used for DTE badge on intraday/swing cards */
export function tradingDaysUntil(date: Date): number {
  const nowDay = new Date();
  nowDay.setUTCHours(0, 0, 0, 0);
  const targetDay = new Date(date);
  targetDay.setUTCHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(nowDay);
  while (d < targetDay) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * Returns the nearest SPY option expiry (Mon/Wed/Fri).
 *
 * Key fix: we now check TODAY first before advancing.
 * - If today is Mon/Wed/Fri AND it's before 3:55 PM ET → return today (0 DTE).
 * - Otherwise advance to the next valid expiry.
 */
export function getNextSpyExpiry(minDte = 0): Date {
  const now = new Date();
  const etOffset = getEdtOffset(now); // 4 = EDT, 5 = EST

  // Current wall-clock hour in ET
  const etHour = (now.getUTCHours() - etOffset + 24) % 24;
  const etMin  = now.getUTCMinutes();
  const etMins = etHour * 60 + etMin;

  // Build "today" in ET as a UTC midnight Date
  const todayUtcMidnight = new Date(now);
  todayUtcMidnight.setUTCHours(0, 0, 0, 0);

  // Day-of-week in ET (the UTC date equals the ET date for midnight UTC)
  const todayDay = todayUtcMidnight.getUTCDay();

  const isSPYDay = (d: number) => d === 1 || d === 3 || d === 5; // Mon, Wed, Fri

  // ── Check TODAY for 0 DTE ────────────────────────────────────────────────
  // Options are live until ~3:55 PM ET on expiry day
  if (minDte === 0 && isSPYDay(todayDay) && etMins < 15 * 60 + 55) {
    return new Date(todayUtcMidnight);
  }

  // ── Advance to next valid SPY expiry ─────────────────────────────────────
  const d = new Date(todayUtcMidnight);
  for (let i = 0; i < 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (isSPYDay(day)) return new Date(d);
  }
  return d;
}

export function getSwingExpiry(minDte = 3): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // Prefer Friday expiry 3-10 days out
  for (let i = 0; i < 21; i++) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 5 && daysUntil(d) >= minDte) return new Date(d);
  }
  return d;
}
