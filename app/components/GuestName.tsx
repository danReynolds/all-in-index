import Link from "next/link";

/**
 * Renders a guest's name, linking to their `/guest/[slug]` profile when they
 * have one (i.e. `slug` is provided). Guests without a scored public call have
 * no page, so they render as plain text — never a broken link.
 */
export function GuestName({
  name,
  slug,
  className = "",
}: {
  name: string;
  slug?: string | null;
  className?: string;
}) {
  if (slug) {
    return (
      <Link href={`/guest/${slug}`} className={`${className} hover:underline`}>
        {name}
      </Link>
    );
  }
  return <span className={className}>{name}</span>;
}
