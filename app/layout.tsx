import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope, Spectral } from "next/font/google";
import { LangProvider } from "@/lib/i18n";
import { SwRegister } from "@/components/ui/SwRegister";
import "./globals.css";

const spectral = Spectral({ variable: "--font-spectral", subsets: ["latin", "latin-ext"], weight: ["500", "700"], style: ["normal", "italic"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"] });
const plex = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin", "latin-ext"], weight: ["500"] });

export const metadata: Metadata = {
  title: { default: "ZamanQapısı AI", template: "%s · ZamanQapısı AI" },
  description: "Azərbaycan memarlıq irsinə virtual zaman səyahəti: 3D bərpa, içəridə gəzinti və danışan AI memar.",
  appleWebApp: { capable: true, title: "ZamanQapısı", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1f7a80",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="az" className={`${spectral.variable} ${manrope.variable} ${plex.variable} antialiased`}>
      <body className="min-h-dvh">
        <LangProvider>{children}</LangProvider>
        <SwRegister />
      </body>
    </html>
  );
}
