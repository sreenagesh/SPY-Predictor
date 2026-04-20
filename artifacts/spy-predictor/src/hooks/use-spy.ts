import {
  useGetSpyData,
  useGetSpyPrediction,
  useGetSpyOptions,
  useGetIntradaySignal,
  useGetSwingSignal,
  useGetMtfAnalysis,
  useGetBestOptions,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

export type TimePeriod = "1h" | "1d" | "1w" | "1mo" | "3mo" | "6mo" | "1y" | "2y";
export const INTRADAY_PERIODS: TimePeriod[] = ["1h", "1d", "1w"];
export const HISTORICAL_PERIODS: TimePeriod[] = ["1mo", "3mo", "6mo", "1y", "2y"];

const REFETCH_MS: Record<TimePeriod, number> = {
  "1h":  60 * 1000,          // 1-min bars → refetch every 60s
  "1d":  5 * 60 * 1000,      // 5-min bars → refetch every 5 min
  "1w":  15 * 60 * 1000,     // 1-hr bars  → refetch every 15 min
  "1mo": 5 * 60 * 1000,
  "3mo": 5 * 60 * 1000,
  "6mo": 5 * 60 * 1000,
  "1y":  5 * 60 * 1000,
  "2y":  5 * 60 * 1000,
};

export function useSpyData(period: TimePeriod = "6mo") {
  return useGetSpyData(
    { period },
    {
      query: {
        staleTime: REFETCH_MS[period] / 2,
        refetchInterval: REFETCH_MS[period],
        refetchOnWindowFocus: INTRADAY_PERIODS.includes(period),
      },
    }
  );
}

export function useSpyPrediction() {
  return useGetSpyPrediction({
    query: {
      refetchInterval: 300000,
      staleTime: 60000,
    },
  });
}

export function useOptionsSignal() {
  return useGetSpyOptions({
    query: {
      refetchInterval: 300000,
      staleTime: 60000,
    },
  });
}

// Intraday scalp signal — refreshes every 5 minutes (aligned with 5-min bar close)
export function useIntradaySignal() {
  return useGetIntradaySignal({
    query: {
      refetchInterval: 5 * 60 * 1000, // every 5 minutes
      staleTime: 60000,
      retry: 2,
    },
  });
}

// Swing / BTST signal — refreshes every 15 minutes (daily bars don't need faster)
export function useSwingSignal() {
  return useGetSwingSignal({
    query: {
      refetchInterval: 15 * 60 * 1000,
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  });
}

// Multi-timeframe analysis (5m, 15m, 1h) — refreshes every 5 minutes
export function useMtfAnalysis() {
  return useGetMtfAnalysis({
    query: {
      refetchInterval: 5 * 60 * 1000,
      staleTime: 60 * 1000,
      retry: 2,
    },
  });
}

// Best Options Scanner — refreshes every 10 minutes (Tradier rate-limit friendly)
// Server caches results, so fast responses after the first warm-up.
export function useBestOptions() {
  return useGetBestOptions({
    query: {
      refetchInterval: 10 * 60 * 1000,
      staleTime: 60 * 1000,
      retry: 3,
      retryDelay: (attempt) => Math.min(8000 * (attempt + 1), 30_000),
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  });
}

export interface NearAtmOption {
  strike: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
}

export interface OptionsFlowData {
  currentPrice: number;
  expiration: string;
  signal: "BUY CALL" | "BUY PUT" | "WAIT";
  signalScore: number;
  instruction: string;
  recommendedStrike: number | null;
  recommendedEntry: number | null;
  recommendedStop: number | null;
  nearAtmPcRatio: number;
  overallPcRatio: number;
  maxPain: number | null;
  callWall: number | null;
  putWall: number | null;
  calls: NearAtmOption[];
  puts: NearAtmOption[];
  scannedAt: string;
}

export function useOptionsFlow() {
  return useQuery<OptionsFlowData>({
    queryKey: ["spy-options-flow"],
    queryFn: async () => {
      const res = await fetch("/api/spy/options-flow");
      if (!res.ok) throw new Error(`options-flow ${res.status}`);
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    retry: 2,
  });
}
