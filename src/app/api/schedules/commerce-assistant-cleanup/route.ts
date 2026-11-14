import { handleSchedule } from "@vercel/schedules";
import { purgeExpiredAssistant } from "@/repositories/commerce-assistant";
export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";
// Private Vercel function. Repeated deliveries only remove already-expired rows.
export const POST = handleSchedule(async () => {
  let removed = 0;
  for (let batch = 0; batch < 10; batch++) {
    const result = await purgeExpiredAssistant(); removed += result.rowCount ?? 0;
    if ((result.rowCount ?? 0) < 200) break;
  }
  console.info("Commerce assistant retention cleanup completed.", { removed });
});
