import { Geist, Geist_Mono } from 'next/font/google';

import type { Metadata } from 'next';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  ),
  title: {
    default: 'AI Interviewer — Practice Smarter',
    template: '%s | AI Interviewer',
  },
  description:
    'Master your technical, behavioral, and system design interviews with real-time AI voice simulation, instant comprehensive feedback, and tailored scorecards.',
  keywords: [
    'AI mock interview',
    'technical interview practice',
    'system design interview',
    'behavioral interview',
    'coding interview preparation',
    'AI career coach',
    'software engineer interview',
  ],
  authors: [{ name: 'AI Interviewer Team' }],
  creator: 'AI Interviewer',
  publisher: 'AI Interviewer',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    siteName: 'AI Interviewer',
    title: 'AI Interviewer — Practice Smarter',
    description:
      'Master your technical, behavioral, and system design interviews with real-time AI voice simulation, instant comprehensive feedback, and tailored scorecards.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Interviewer — Practice Smarter',
    description:
      'Master your technical, behavioral, and system design interviews with real-time AI voice simulation, instant comprehensive feedback, and tailored scorecards.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
