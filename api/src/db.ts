import postgres from "postgres";
import { config } from "./config.js";

// Supabase transaction pooler (port 6543) không hỗ trợ prepared statements.
export const sql = postgres(config.DB_URL, { prepare: false });

const websites = sql`${sql(config.DB_SCHEMA)}.websites`;

export type Website = {
  url: string;
  originalContent: string;
  translatedContent: string;
  translatedAt: Date;
};

const columns = sql`
  url,
  original_content   AS "originalContent",
  translated_content AS "translatedContent",
  translated_at      AS "translatedAt"
`;

export async function findWebsiteByUrl(url: string): Promise<Website | undefined> {
  const [row] = await sql<Website[]>`SELECT ${columns} FROM ${websites} WHERE url = ${url}`;
  return row;
}

export async function upsertWebsite(input: {
  url: string;
  originalContent: string;
  translatedContent: string;
}): Promise<Website> {
  const [row] = await sql<Website[]>`
    INSERT INTO ${websites} (url, original_content, translated_content, translated_at)
    VALUES (${input.url}, ${input.originalContent}, ${input.translatedContent}, now())
    ON CONFLICT (url) DO UPDATE SET
      original_content   = EXCLUDED.original_content,
      translated_content = EXCLUDED.translated_content,
      translated_at      = EXCLUDED.translated_at
    RETURNING ${columns}
  `;
  return row!;
}
