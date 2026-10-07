import type { Metadata } from "next";
import { Toaster } from "sonner";

import { prompt, sarabun } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "S2Health PA Dashboard",
  description:
    "ระบบติดตามตัวชี้วัด PA เครือข่ายสุขภาพอำเภอสอง จังหวัดแพร่",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${prompt.variable} ${sarabun.variable} antialiased text-slate-900 bg-slate-50 font-sans`}
      >
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
