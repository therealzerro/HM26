// hooks/useBrief.ts
//
// On-demand daily-brief data for the admin BriefView. Disabled by default —
// generating pulls ~8k rows (30d + 90d histories, paginated), so it only runs
// when the operator presses Generate (via the returned `generate(date)`).
// Read-only; see lib/brief/computeBrief.ts.

import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { computeBrief, type BriefData } from '@/lib/brief/computeBrief';

export function useBrief() {
  const [runDate, setRunDate] = useState<string | null>(null);

  const query = useQuery<BriefData>({
    queryKey: ['brief', runDate],
    queryFn: () => computeBrief(runDate as string),
    enabled: runDate != null,
    staleTime: 5 * 60 * 1000,   // 5 min — brief reflects current DB state
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const generate = useCallback((date: string) => setRunDate(date), []);

  return {
    data: query.data,
    isLoading: query.isFetching,
    error: query.error as Error | null,
    runDate,
    generate,
    refetch: query.refetch,
  };
}
