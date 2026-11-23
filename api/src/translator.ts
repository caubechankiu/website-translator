import { createRequire } from "node:module";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";

// Trên Vercel: SDK tìm binary Claude Code qua tên package ghép động nên Vercel
// không tự đóng gói. Chỉ đường dẫn tường minh (kèm includeFiles trong vercel.json),
// và cho Claude Code ghi config vào /tmp vì thư mục home chỉ đọc.
let claudeExecutable: string | undefined;
if (process.env.VERCEL) {
  process.env.HOME = "/tmp";
  process.env.CLAUDE_CONFIG_DIR = "/tmp/.claude";
  claudeExecutable = createRequire(import.meta.url).resolve(
    "@anthropic-ai/claude-agent-sdk-linux-x64/claude",
  );
}

const SYSTEM_PROMPT = `Bạn là biên dịch viên chuyên nghiệp. Người dùng gửi nội dung một trang web dưới dạng Markdown; hãy dịch sang tiếng Việt và trả về Markdown.

Quy tắc dịch:
- Dịch tự nhiên, đúng ngữ cảnh, giữ nguyên ý nghĩa và giọng văn của bản gốc.
- Phần nào đã là tiếng Việt thì giữ nguyên.
- Giữ nguyên tên riêng, thương hiệu, email và các thuật ngữ kỹ thuật thường để nguyên trong tiếng Việt.

Giữ nguyên cấu trúc Markdown, chỉ dịch phần chữ người đọc nhìn thấy:
- Cú pháp: tiêu đề (#), danh sách, trích dẫn (>), bảng (giữ đúng số cột và dòng phân cách), đường kẻ ngang, in đậm/nghiêng, footnote, frontmatter (chỉ dịch giá trị là văn bản, không dịch key).
- Code block (\`\`\`...\`\`\`) và inline code (\`...\`): giữ nguyên hoàn toàn, kể cả comment bên trong.
- Link [chữ](url) và ảnh ![alt](url "title"): dịch phần chữ, alt và title; giữ nguyên URL. Giữ nguyên nhãn của reference link ([chữ][nhãn]) và dòng định nghĩa [nhãn]: url.
- Giữ nguyên HTML nhúng (thẻ, thuộc tính), chỉ dịch chữ hiển thị bên trong.
- Giữ nguyên dòng trống và cách xuống dòng để bố cục không đổi.

Chỉ trả về Markdown đã dịch. Không thêm lời giải thích hay ghi chú, và không bọc toàn bộ kết quả trong code block.`;

export class TranslationError extends Error {}

export async function translateToVietnamese(url: string, content: string): Promise<string> {
  const prompt = `Dịch nội dung Markdown của trang ${url} bên trong thẻ <content> sang tiếng Việt.\n\n<content>\n${content}\n</content>`;

  const stream = query({
    prompt,
    options: {
      model: config.CLAUDE_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      tools: [], // chỉ cần dịch, không cho agent dùng tool nào
      maxTurns: 1,
      settingSources: [], // không đọc settings/CLAUDE.md trên máy chủ
      persistSession: false,
      pathToClaudeCodeExecutable: claudeExecutable,
    },
  });

  for await (const message of stream) {
    if (message.type !== "result") continue;
    if (message.subtype === "success" && !message.is_error) {
      return message.result.trim();
    }
    throw new TranslationError(`Dịch thất bại: ${message.subtype}`);
  }
  throw new TranslationError("Agent kết thúc mà không trả kết quả");
}
