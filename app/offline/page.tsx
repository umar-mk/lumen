import LessonPlayer from "@/components/LessonPlayer";
import { offlineDerivativeLesson } from "@/lib/offlinePipeline";

export default function OfflinePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-black text-white">
      <LessonPlayer lesson={offlineDerivativeLesson} chrome="cinema" />
    </main>
  );
}
