import { useGetSpyData, useGetSpyPrediction, useGetSpyOptions } from "@workspace/api-client-react";

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
      // Auto-refresh prediction every 5 minutes
      refetchInterval: 300000,
      staleTime: 60000,
    },
  });
}

export function useOptionsSignal() {
  return useGetSpyOptions({
    query: {
      // Auto-refresh options signal every 5 minutes
      refetchInterval: 300000,
      staleTime: 60000,
    },
  });
}
