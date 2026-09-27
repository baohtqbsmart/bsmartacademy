import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { Providers } from "@/components/providers"
import { siteConfig } from "@/config/site"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  // Vietnamese names and content need the vietnamese subset (ạ, ế, ữ, …).
  subsets: ["latin", "latin-ext", "vietnamese"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
  description: siteConfig.description,
  // A private school system: keep every page out of search engines.
  robots: { index: false, follow: false, nocache: true },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
