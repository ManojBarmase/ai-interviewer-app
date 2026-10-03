import { ActiveInterviewRoom } from "@/components/domain";

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-background">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-text-primary">
            AI Mock Interviewer
          </h1>
          <p className="text-text-secondary">
            Test the STT, TTS, and Gemini integration below.
          </p>
        </header>

        {/* Render our newly built component */}
        <ActiveInterviewRoom />
      </div>
    </main>
  );
}
