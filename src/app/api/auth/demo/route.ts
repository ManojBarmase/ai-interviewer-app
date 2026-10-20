import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * Enterprise Demo Session Handler
 *
 * Provides instant 1-click access for reviewers, recruiters, and demo candidates
 * without relying on external SMTP email confirmation or hitting Supabase email rate limits.
 */

export async function POST() {
  const cookieStore = await cookies();

  // Set an HttpOnly, secure session cookie for the demo candidate
  cookieStore.set('demo_candidate_session', 'true', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return NextResponse.json({
    success: true,
    message: 'Demo candidate session initialized successfully.',
  });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('demo_candidate_session');
  return NextResponse.json({ success: true, message: 'Demo session cleared.' });
}
