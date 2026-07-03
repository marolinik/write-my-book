import { Skeleton } from "@/components/ui/skeleton";

export default function BooksLoading() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="mt-8 first:mt-0">
          <Skeleton className="mb-3 h-4 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
