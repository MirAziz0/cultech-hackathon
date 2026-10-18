import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Inter } from "next/font/google";
import { LangProvider } from "@/lib/i18n";
import { SwRegister } from "@/components/ui/SwRegister";
import "./globals.css";

const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], style: ["normal", "italic"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
const plex = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin", "latin-ext"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: { default: "ZamanQapısı AI", template: "%s · ZamanQapısı AI" },
  description: "Azərbaycan memarlıq irsinə virtual zaman səyahəti: 3D bərpa, içəridə gəzinti və danışan AI memar.",
  appleWebApp: { capable: true, title: "ZamanQapısı", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#007a87",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="az" className={`${cormorant.variable} ${inter.variable} ${plex.variable} antialiased`}>
      <body className="min-h-dvh">
        <LangProvider>{children}</LangProvider>
        <SwRegister />
      </body>
    </html>
  );
}
