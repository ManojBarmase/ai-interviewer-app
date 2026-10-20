import { SetupWizard } from '@/features/setup';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Configure Interview — AI Mock Interviewer',
  description:
    'Customize your target role, seniority level, tech stack, and interviewer persona.',
};

export default function SetupPage() {
  return <SetupWizard />;
}
