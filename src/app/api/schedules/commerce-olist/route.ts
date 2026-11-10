import { handleSchedule } from "@vercel/schedules";
import { runScheduledCommerceOlist } from "@/services/commerce/olist-scheduled-run";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// vercel.json declares this function private: do not expose it through a path
// target or rewrite. handleSchedule parses metadata; platform isolation is auth.
export const POST = handleSchedule(runScheduledCommerceOlist);
