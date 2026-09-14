import type { Metadata } from "next";
import { Geist, Geist_Mono, Chakra_Petch } from "next/font/google";
import "@livekit/components-styles";
import "./globals.css";
import { VoiceSessionProvider } from "@/components/VoiceSession";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const headingFont = Chakra_Petch({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alveo",
  icons: { icon: "/alveo-logo.png", apple: "/alveo-logo.png" },
  description: "Voice, video and multi-source streaming for your table",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${headingFont.variable} h-full antialiased`}
    >
      <body className="min-h-full h-dvh flex flex-col overflow-hidden"><VoiceSessionProvider>{children}</VoiceSessionProvider></body>
    </html>
  );
}
