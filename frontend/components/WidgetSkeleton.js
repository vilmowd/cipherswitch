export default function WidgetSkeleton({ label = "Loading" }) {
  return (
    <div className="panel p-4 sm:p-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="space-y-4">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        <div className="h-7 w-2/5 max-w-xs animate-pulse rounded bg-slate-200" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-14 animate-pulse rounded-lg bg-slate-100" />
        </div>
        <div className="h-11 w-40 animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}
