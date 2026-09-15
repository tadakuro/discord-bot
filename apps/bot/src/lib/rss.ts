import { EmbedBuilder } from "discord.js";
import { fetchText } from "./web.js";
import { C } from "./embeds.js";

export type RSSItem = {
  title: string;
  link?: string;
  guid: string;
};

function textBetween(input: string, tag: string): string {
  const m = input.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function parseRSS(url: string): Promise<RSSItem[] | null> {
  try {
    const xml = await fetchText(url);
    const itemBlocks = xml.split(/<item[\s>]/i).slice(1).map((b) => b.split("</item>")[0]);
    if (itemBlocks.length === 0) {
      const entryBlocks = xml.split(/<entry[\s>]/i).slice(1).map((b) => b.split("</entry>")[0]);
      const items: RSSItem[] = [];
      for (const b of entryBlocks) {
        const title = textBetween(b, "title");
        if (!title) continue;
        const guid = textBetween(b, "id") || textBetween(b, "link");
        items.push({ title, link: textBetween(b, "link"), guid: guid || title });
      }
      return items;
    }
    const items: RSSItem[] = [];
    for (const b of itemBlocks) {
      const title = textBetween(b, "title");
      if (!title) continue;
      const guid = textBetween(b, "guid") || textBetween(b, "link") || title;
      items.push({ title, link: textBetween(b, "link"), guid });
    }
    return items;
  } catch {
    return null;
  }
}

export function feedLabel(url: string): string {
  const m = url.match(/youtube\.com\/feeds\/videos\.xml\?channel_id=([^&]+)/i);
  if (m) return "YouTube";
  if (/github\.com\//i.test(url)) return "GitHub";
  if (/reddit\.com\/r\//i.test(url)) return "Reddit";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Feed";
  }
}

export function fmtRSSItem(url: string, item: RSSItem): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(C.info)
    .setAuthor({ name: feedLabel(url) })
    .setTitle(item.title.slice(0, 256))
    .setURL(item.link ?? null)
    .setFooter({ text: "via RSS" });
}