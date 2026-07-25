// hooks/useDrawWindow.ts — ENH-ANALYTICS-01
//
// React Query wrapper for the analytics draw window. Keyed by window only —
// session/pair-mode/sort filters are client-side over the cached rows, so
// toggling them is instant. 'clean' (~10k rows, ~10 pages) is the heaviest.

import { useQuery } from '@tanstack/react-query';
import { fetchDrawWindow, type DrawRow, type WindowKey } from '@/lib/analytics/drawWindow';

export function useDrawWindow(win: WindowKey) {
  const query = useQuery<DrawRow[]>({
    queryKey: ['analytics-draws', win],
    queryFn: () => fetchDrawWindow(win),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isFetching && !query.data,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
