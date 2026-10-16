// Small inline SVG icon set (no icon font, no network).
type P = { className?: string };

const base = (path: React.ReactNode, className = "h-6 w-6") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {path}
  </svg>
);

export const ListIcon = ({ className }: P) => base(<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />, className);
export const SettleIcon = ({ className }: P) => base(<path d="M7 7h11l-3-3M17 17H6l3 3" />, className);
export const ActivityIcon = ({ className }: P) => base(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />, className);
export const GroupIcon = ({ className }: P) =>
  base(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c-.4-2.6-1.9-4.4-4-5.1" />
    </>,
    className,
  );
export const PlusIcon = ({ className }: P) => base(<path d="M12 5v14M5 12h14" />, className);
export const BackIcon = ({ className }: P) => base(<path d="M15 18l-6-6 6-6" />, className);
export const ChevronIcon = ({ className }: P) => base(<path d="M9 18l6-6-6-6" />, className);
export const CloseIcon = ({ className }: P) => base(<path d="M18 6L6 18M6 6l12 12" />, className);
export const CameraIcon = ({ className }: P) =>
  base(
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>,
    className,
  );
export const ReceiptIcon = ({ className }: P) => base(<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h4" />, className);
export const ShareIcon = ({ className }: P) => base(<path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" />, className);
export const CopyIcon = ({ className }: P) =>
  base(
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V4h12" />
    </>,
    className,
  );
export const DownloadIcon = ({ className }: P) => base(<path d="M12 3v12M7 10l5 5 5-5M4 20h16" />, className);
export const ExpandIcon = ({ className }: P) => base(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />, className);
export const QrIcon = ({ className }: P) =>
  base(
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </>,
    className,
  );
