import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/AuthContext";
import { SocketProvider } from "@/context/SocketContext";
import { GameProvider } from "@/context/GameContext";
import { Toaster } from "@/components/ui/sonner";
// @ts-ignore
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const kungFuPanda = localFont({
  src: "../public/fonts/KungFuPandaRegular.ttf",
  variable: "--font-kungfu",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Takedown - Competitive Coding Duels",
  description: "Challenge your friends to coding duels",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${kungFuPanda.variable} antialiased font-kungfu`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <SocketProvider>
              <GameProvider>
                {children}
                <Toaster position="top-right" richColors duration={2000} />
              </GameProvider>
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
