// Lightweight skeleton placeholder for loading states.
// Pure CSS shimmer (transform/opacity only) - no motion/react spring physics,
// so it stays cheap even when many placeholders render at once.
interface SkeletonCardProps {
  viewMode?: 'grid' | 'list';
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`skeleton-block ${className ?? ''}`} />;
}

export function SkeletonCard({ viewMode = 'grid' }: SkeletonCardProps) {
  if (viewMode === 'list') {
    return (
      <div className="bg-trae-card/40 border border-trae-border px-3 py-2.5 flex items-center gap-3">
        <SkeletonBlock className="w-3.5 h-3.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <SkeletonBlock className="h-3.5 w-1/3" />
        </div>
        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          <SkeletonBlock className="h-3 w-10" />
          <SkeletonBlock className="h-3 w-10" />
          <SkeletonBlock className="h-3 w-10" />
        </div>
        <SkeletonBlock className="hidden md:block h-3 w-[140px] shrink-0" />
        <SkeletonBlock className="hidden sm:block h-3 w-[70px] shrink-0" />
        <div className="flex items-center gap-1.5 shrink-0">
          <SkeletonBlock className="w-5 h-5" />
          <SkeletonBlock className="h-5 w-14" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-trae-card/40 border border-trae-border p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <SkeletonBlock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="h-3 w-12" />
      </div>
      <div className="flex items-center justify-between pt-1">
        <SkeletonBlock className="h-3 w-24" />
        <div className="flex items-center gap-1.5">
          <SkeletonBlock className="w-5 h-5" />
          <SkeletonBlock className="h-5 w-14" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({
  count = 8,
  viewMode = 'grid',
}: {
  count?: number;
  viewMode?: 'grid' | 'list';
}) {
  return (
    <div className={viewMode === 'list' ? 'space-y-1.5' : 'space-y-2.5'}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} viewMode={viewMode} />
      ))}
    </div>
  );
}
