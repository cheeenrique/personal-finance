import { z } from "zod";
import { AlertType } from "@/generated/prisma/enums";

const ALERT_TYPE_VALUES = Object.values(AlertType) as [AlertType, ...AlertType[]];

export const listAlertsSchema = z.object({
  type: z.enum(ALERT_TYPE_VALUES).optional(),
  unreadOnly: z.boolean().optional(),
});

export type ListAlertsInput = z.infer<typeof listAlertsSchema>;
