import {
  useGetSpyData,
  useGetSpyPrediction,
  useGetSpyOptions,
  useGetIntradaySignal,
  useGetSwingSignal,
} from "@workspace/api-client-react";

export type TimePeriod = "1mo" | "3mo" | "6mo" | "1y" | "2y";

export function useSpyData(period: TimePeriod = "6mo") {
  return useGetSpyData(
    { period },
    {
      query: {
        staleTime: 60000,
        refetchOnWindowFocus: false,
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
      refetchInterval: 15 * 60 * 1000, // every 15 minutes
      staleTime: 5 * 60 * 1000,
      retry: 2,
    },
  });
}
