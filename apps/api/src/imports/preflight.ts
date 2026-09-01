// Lightweight source-photo reachability check. GET, not HEAD — some asset
// hosts misbehave on HEAD (SPEC §5 / CONTEXT eligibility). Body is discarded.
export async function preflightPhoto(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.body) await res.body.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

export async function preflightMany(
  urls: string[],
  concurrency = 5,
): Promise<Map<string, boolean>> {
  const unique = [...new Set(urls)];
  const results = new Map<string, boolean>();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
      while (cursor < unique.length) {
        const url = unique[cursor++]!;
        results.set(url, await preflightPhoto(url));
      }
    }),
  );
  return results;
}
