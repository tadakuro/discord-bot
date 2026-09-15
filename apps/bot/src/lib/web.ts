export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "DCBot/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

type Weather = {
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  desc: string;
  city: string;
  icon: string;
};

export async function getWeather(city: string): Promise<Weather | null> {
  try {
    const cityRes = await fetchText(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const geo = JSON.parse(cityRes) as { results?: { latitude: number; longitude: number; name: string; country?: string }[] };
    const hit = geo.results?.[0];
    if (!hit) return null;
    const f = await fetchText(
      `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`
    );
    const data = JSON.parse(f) as {
      current?: { temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
    };
    const c = data.current;
    if (!c) return null;
    const desc = weatherCodeDesc(c.weather_code);
    const icon = weatherIcon(c.weather_code);
    return {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      desc,
      icon,
      city: `${hit.name}${hit.country ? `, ${hit.country}` : ""}`,
    };
  } catch {
    return null;
  }
}

function weatherCodeDesc(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Cloudy";
}

function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌦️";
  return "⛈️";
}

type Crypto = {
  id: string;
  name: string;
  symbol: string;
  priceUsd: number;
  change24h: number;
  marketCap: number;
};

export async function getCrypto(query: string): Promise<Crypto | null> {
  try {
    const q = query.toLowerCase().trim();
    const list = JSON.parse(await fetchText("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1")) as Crypto[];
    const hit = list.find((c) => c.id === q || c.symbol.toLowerCase() === q || c.name.toLowerCase() === q);
    if (!hit) {
      const search = JSON.parse(await fetchText(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)) as { coins?: { id: string; name: string; symbol: string }[] };
      const s = search.coins?.[0];
      if (!s) return null;
      const exact = await fetchText(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${s.id}&order=market_cap_desc&per_page=1&page=1`);
      const arr = JSON.parse(exact) as Crypto[];
      return arr[0] ?? null;
    }
    return hit;
  } catch {
    return null;
  }
}

type DictEntry = {
  word: string;
  phonetic: string;
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[];
};

export async function getDictionary(word: string): Promise<DictEntry | null> {
  try {
    const res = await fetchText(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const arr = JSON.parse(res) as DictEntry[];
    return arr[0] ?? null;
  } catch {
    return null;
  }
}

export function parseDuration(input: string): number | null {
  const m = input.match(/^(\d+)\s*([smhdw])(?:\s*(\d+)\s*([smhdw]))?$/i);
  if (!m) return null;
  const mult: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  const first = parseInt(m[1], 10) * mult[m[2].toLowerCase()];
  const second = m[3] ? parseInt(m[3], 10) * mult[m[4].toLowerCase()] : 0;
  const total = first + second;
  if (!(total > 0) || total > 90 * 86400000) return null;
  return total;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${min % 60 ? ` ${min % 60}m` : ""}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ""}`;
}

export function snowflakeDate(id: string): Date | null {
  try {
    const ms = Number(id) / 4194304 + 1420070400000;
    return new Date(ms);
  } catch {
    return null;
  }
}

export function relative(t: Date): string {
  const diff = t.getTime() - Date.now();
  const abs = Math.abs(diff);
  const unit = abs < 60000 ? "s" : abs < 3600000 ? "m" : abs < 86400000 ? "h" : "d";
  const n = Math.max(1, Math.floor(unit === "s" ? abs / 1000 : unit === "m" ? abs / 60000 : unit === "h" ? abs / 3600000 : abs / 86400000));
  return `${n}${unit}${diff < 0 ? " ago" : ""}`;
}