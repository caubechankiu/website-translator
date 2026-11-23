import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().default(3000),
  SECRET: z.string().min(1),
  DB_URL: z.string().min(1),
  DB_SCHEMA: z.string().min(1).default("website_translator"),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5-5"),
});

export const config = Env.parse(process.env);
