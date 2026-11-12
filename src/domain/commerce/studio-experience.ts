import { z } from "zod";
import { safeCommerceMediaUrl } from "./product-media";
export const storeExperienceSchema = z.object({
  style: z.enum(["classic", "studio"]),
  motion: z.boolean(),
  backgroundUrl: safeCommerceMediaUrl,
}).strict();
export type StoreExperience = z.infer<typeof storeExperienceSchema>;
export const defaultStoreExperience = (): StoreExperience => ({ style: "classic", motion: true, backgroundUrl: "" });
