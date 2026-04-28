// Shared Tradier API helpers — used by gex.ts and available to other routes

const TRADIER_BASE = "https://api.tradier.com/v1";

export interface TradierGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  mid_iv: number;
  bid_iv: number;
  ask_iv: number;
}

export interface TradierOption {
  symbol: string;
  bid: number;
  ask: number;
  volume: number;
  open_interest: number;
  strike: number;
  expiration_date: string;
  option_type: "call" | "put";
  root_symbol: string;
  greeks?: TradierGreeks;
}

export async function tradierGet(path: string): Promise<any> {
  const token = process.env.TRADIER_API_KEY;
  if (!token) throw new Error("TRADIER_API_KEY not configured");
  const res = await fetch(`${TRADIER_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tradier ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchExpirations(symbol: string): Promise<string[]> {
  try {
    const data = await tradierGet(
      `/markets/options/expirations?symbol=${symbol}&includeAllRoots=false`,
    );
    const exps = data?.expirations?.date;
    if (!exps) return [];
    return Array.isArray(exps) ? exps : [exps];
  } catch {
    return [];
  }
}

export async function fetchChain(
  symbol: string,
  expiration: string,
): Promise<TradierOption[]> {
  try {
    const data = await tradierGet(
      `/markets/options/chains?symbol=${symbol}&expiration=${expiration}&greeks=true`,
    );
    const opts = data?.options?.option;
    if (!opts) return [];
    return Array.isArray(opts) ? opts : [opts];
  } catch {
    return [];
  }
}

export function daysToExpiry(expDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expDate + "T00:00:00Z");
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
