import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D2 Garments | Operations",
  description: "Inventory, orders and cash flow for D2 Garments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
