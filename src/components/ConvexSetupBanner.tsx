import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isConvexConfigured } from "@/lib/convex-config";

export function ConvexSetupBanner() {
  if (isConvexConfigured()) return null;

  return (
    <Alert className="rounded-none border-x-0 border-t-0 border-amber-200 bg-amber-50 text-amber-900">
      <AlertCircleIcon />
      <AlertDescription>
        Convex is not configured. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>{" "}
        to connect the database and enable live content.
      </AlertDescription>
    </Alert>
  );
}
