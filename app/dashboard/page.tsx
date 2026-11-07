import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";
export default function Page() {
  return (
    <Suspense
      fallback={<div className="loading-page">Opening your classroom…</div>}
    >
      <Dashboard />
    </Suspense>
  );
}
