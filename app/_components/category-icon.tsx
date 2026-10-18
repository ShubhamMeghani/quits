// A category icon in a soft coloured circle (visual only; the category name is shown elsewhere).
import type { CSSProperties, ReactNode } from "react";
import { categoryStyle, type CategoryIconName } from "@/lib/category-style";

const PATHS: Record<CategoryIconName, ReactNode> = {
  food: <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7v4h3" />,
  groceries: <path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2M9.5 20.5h.01M17 20.5h.01" />,
  rent: <path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5" />,
  utilities: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  travel: <path d="M10.5 21l2-7.5L19 10a1.8 1.8 0 0 0-1-3.4L11.5 8 6 3.5 4 4.5l3.5 5L4 11l-1.5-1.5L1.5 10l2 3 3.2-.4L5.5 21z" />,
  transport: <path d="M5 17h14v-5l-2-5H7l-2 5zM5 12h14M7.5 17v2M16.5 17v2M8 14.5h.01M16 14.5h.01" />,
  entertainment: <path d="M4 5h16v14H4zM4 9h16M8 5l2 4M13 5l2 4M10 12.5v4l3.5-2z" />,
  shopping: <path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2" />,
  health: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM12 9.5v5M9.5 12h5" />,
  education: <path d="M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6" />,
  other: <path d="M4 12h.01M12 12h.01M20 12h.01M3 7h18v10H3z" />,
};

export function CategoryIcon({ category }: { category: string }) {
  const s = categoryStyle(category);
  return (
    <span
      aria-hidden="true"
      data-category-icon={s.icon}
      className="cat-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ "--cat-light": s.light, "--cat-dark": s.dark } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        {PATHS[s.icon]}
      </svg>
    </span>
  );
}
