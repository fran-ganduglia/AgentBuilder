import { Skeleton } from "@/components/ui/skeleton";

export default function UsageLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-2 h-2 w-full" />
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    </div>
  );
}
