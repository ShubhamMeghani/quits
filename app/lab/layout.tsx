import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quits lab",
  robots: { index: false, follow: false },
};

export default function LabLayout({ children }: LayoutProps<"/lab">) {
  return <main className="mx-auto w-full max-w-[640px] px-4 py-6">{children}</main>;
}
