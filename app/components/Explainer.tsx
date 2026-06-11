/**
 * A quiet, collapsible "how does this work?" disclosure — methodology text
 * stays one click away instead of permanently occupying the page.
 */
export function Explainer({
  summary = "How this works",
  children,
}: {
  summary?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group text-xs">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-neutral-500 transition-colors hover:text-neutral-300 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ring-1 ring-inset ring-neutral-600 text-[9px] group-open:bg-neutral-700">
          i
        </span>
        {summary}
      </summary>
      <div className="mt-2 max-w-2xl leading-relaxed text-neutral-400">{children}</div>
    </details>
  );
}
