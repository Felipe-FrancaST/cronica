export interface CleanupJob {
  id: string;
  bucket_id: string;
  name: string;
}
export interface CleanupStorage {
  lease(limit: number): Promise<CleanupJob[]>;
  remove(bucket: string, name: string): Promise<void>;
  finish(id: string, error?: string): Promise<void>;
}

export async function cleanUnusedMedia(storage: CleanupStorage, deadline: number, maximum = 100) {
  let removed = 0,
    failed = 0;
  while (Date.now() < deadline - 1500 && removed + failed < maximum) {
    const jobs = await storage.lease(Math.min(12, maximum - removed - failed));
    if (!jobs.length) break;
    for (let offset = 0; offset < jobs.length; offset += 3) {
      if (Date.now() >= deadline - 1500) break;
      await Promise.all(
        jobs.slice(offset, offset + 3).map(async (job) => {
          try {
            await storage.remove(job.bucket_id, job.name);
            await storage.finish(job.id);
            removed++;
          } catch {
            failed++;
            // A failed completion stays leased and is recovered after lease expiry.
            await storage.finish(job.id, 'storage_cleanup_failed').catch(() => {});
          }
        }),
      );
    }
  }
  return { removed, failed, budget_exhausted: Date.now() >= deadline - 1500 };
}
