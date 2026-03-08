import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="border-b border-gray-200 px-4 py-3">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="flex-1 space-y-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
            <Skeleton className={`h-12 rounded-lg ${i % 2 === 0 ? "w-48" : "w-64"}`} />
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}
