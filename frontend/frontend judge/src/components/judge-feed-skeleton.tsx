import { Skeleton } from "@/components/ui/skeleton";

/** Matches the judge card layout so the swap between states doesn't jump. */
export function JudgeFeedSkeleton() {
  return (
    <div className="panel overflow-hidden">
      <Skeleton className="h-52 w-full rounded-none" />
      <div className="space-y-4 p-7">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </div>
    </div>
  );
}
