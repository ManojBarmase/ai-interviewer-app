import { NextResponse, type NextRequest } from 'next/server';

import { createSessionLogger } from '@/lib/logger';
import { BadRequestError } from '@/server/errors/AppError';
import { groq } from '@/server/integrations/ai/groq.client';
import { handleApiError } from '@/server/utils/api-response';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

export const dynamic = 'force-dynamic';

/**
 * Enterprise Speech-to-Text Endpoint powered by Groq Whisper Large v3 Turbo.
 * Transcribes audio chunks (webm/wav/mp4/ogg) with sub-250ms latency.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const log = createSessionLogger('stt', { route: '/api/interview/stt' });

  try {
    await getAuthenticatedUser(req);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      throw new BadRequestError('No audio file provided in request payload.');
    }

    const language = (formData.get('language') as string | null) || 'en';

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language,
      response_format: 'json',
      temperature: 0.0,
    });

    const text = transcription.text?.trim() || '';

    return NextResponse.json({
      text,
      provider: 'groq-whisper-large-v3-turbo',
    });
  } catch (err) {
    return handleApiError(err, log);
  }
}
