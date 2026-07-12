import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const AdminDelphi = lazy(() => import("@/components/admin/AdminDelphi"));

export default function DelphiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      }
    >
      <AdminDelphi />
    </Suspense>
  );
}
