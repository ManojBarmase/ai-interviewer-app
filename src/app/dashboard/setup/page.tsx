import { SetupWizard } from '@/features/setup';

export const metadata = {
  title: 'Configure Interview — AI Mock Interviewer',
  description:
    'Customize your target role, seniority level, tech stack, and interviewer persona.',
};

export default function SetupPage() {
  return <SetupWizard />;
}
