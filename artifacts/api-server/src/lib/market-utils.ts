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

export function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// For SPY: 0DTE on Mon/Wed/Fri, 1DTE otherwise
export function getNextSpyExpiry(minDte = 0): Date {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day === 1 || day === 3 || day === 5) {
      if (daysUntil(d) >= minDte) return new Date(d);
    }
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
