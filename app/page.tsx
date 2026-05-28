import { Suspense } from "react";
import { LessonView } from "@/components/LessonView";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LessonView />
    </Suspense>
  );
}
