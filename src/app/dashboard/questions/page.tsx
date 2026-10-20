/**
 * @file Question Bank Page — /dashboard/questions
 * @description Server component that provides the question data and renders
 * the client-side Question Bank UI.
 */
import { QuestionBankClient } from '@/features/question-bank';

export const metadata = {
  title: 'Question Bank — AI Mock Interviewer',
  description:
    '48 curated interview questions with model answers and key concepts.',
};

export default function QuestionBankPage() {
  return <QuestionBankClient />;
}
