import { z } from "zod";

export const ALLOWED_SORT_COLUMNS = ["accountId", "monthlyCapSeconds", "createdAt"];

export const accountQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  search: z.string().trim().max(50).optional(),
  sort_by: z.enum(["accountId", "monthlyCapSeconds", "createdAt"]).optional(),
  sort_dir: z.enum(["asc", "desc"]).optional(),
  include_usage: z.enum(["true", "false"]).optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export default accountQuerySchema;
