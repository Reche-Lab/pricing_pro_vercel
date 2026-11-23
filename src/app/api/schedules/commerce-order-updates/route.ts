import { handleSchedule } from "@vercel/schedules";
import { runScheduledCommerceOrderUpdates } from "@/services/commerce/order-updates-scheduled-run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export const POST = handleSchedule(runScheduledCommerceOrderUpdates);
