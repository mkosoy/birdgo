export interface SpeciesGuideSound {
  id: string;
  title: string;
  url: string;
  descriptionUrl?: string;
  recordist?: string;
  license?: string;
  durationSeconds?: number;
  recordingType?: string;
  description?: string;
  source?: string;
}

export interface SpeciesGuide {
  summary?: string;
  summaryUrl?: string;
  imageUrl?: string;
  sounds: SpeciesGuideSound[];
  sources: {
    encyclopedia?: string;
    audio?: string;
  };
}

interface WikipediaSummaryResponse {
  type?: string;
  extract?: string;
  content_urls?: {
    desktop?: { page?: string };
  };
  thumbnail?: { source?: string };
}

interface CommonsMetadataEntry {
  value?: unknown;
}

interface CommonsDerivative {
  src?: string;
  type?: string;
}

interface CommonsVideoInfo {
  url?: string;
  descriptionurl?: string;
  duration?: number;
  mime?: string;
  derivatives?: CommonsDerivative[];
  extmetadata?: Record<string, CommonsMetadataEntry | undefined>;
}

interface CommonsPage {
  pageid?: number;
  index?: number;
  title?: string;
  videoinfo?: CommonsVideoInfo[];
}

interface CommonsResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

interface InatSound {
  id?: number;
  license_code?: string | null;
  attribution?: string;
  file_url?: string;
  file_content_type?: string;
  hidden?: boolean;
}

interface InatObservationSound {
  id?: number;
  uri?: string;
  description?: string | null;
  observed_on?: string | null;
  place_guess?: string | null;
  quality_grade?: string;
  taxon?: {
    name?: string;
    preferred_common_name?: string;
    iconic_taxon_name?: string;
    rank?: string;
  } | null;
  user?: {
    login?: string;
    name?: string;
  };
  sounds?: InatSound[];
}

interface InatSoundResponse {
  results?: InatObservationSound[];
}

const GUIDE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GUIDE_CACHE_MAX_ENTRIES = 200;
const guideCache = new Map<string, { expiresAt: number; guide: SpeciesGuide }>();
const USER_AGENT = "BirdGo/1.0 (educational birding app)";

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanHtml(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function metadataText(info: CommonsVideoInfo, key: string): string | undefined {
  return cleanHtml(info.extmetadata?.[key]?.value);
}

function metadataRaw(info: CommonsVideoInfo, key: string): string | undefined {
  const value = info.extmetadata?.[key]?.value;
  return typeof value === "string" ? value : undefined;
}

function recordingType(info: CommonsVideoInfo): string | undefined {
  const raw = metadataRaw(info, "ImageDescription");
  const match = raw?.match(/<b>\s*Type:\s*<\/b>\s*([^<\n]+)/i);
  return match?.[1]?.trim().toLowerCase().replace(/\s+/g, " ") || undefined;
}

function recordingDescription(info: CommonsVideoInfo): string | undefined {
  const raw = metadataRaw(info, "ImageDescription");
  if (!raw) return undefined;
  const lead = cleanHtml(raw.split(/<dl[\s>]/i)[0]?.replace(/^\s*:\s*/, ""));
  if (!lead) return undefined;
  return lead.length > 170 ? `${lead.slice(0, 167).trim()}…` : lead;
}

async function fetchJson<T>(url: string, timeoutMs = 4500): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWikipediaSummary(scientificName?: string, commonName?: string): Promise<Pick<SpeciesGuide, "summary" | "summaryUrl" | "imageUrl"> | undefined> {
  const candidates = [scientificName, commonName]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => normalizeName(value) !== normalizeName(values[index - 1] ?? ""));
  for (const candidate of candidates) {
    try {
      const summary = await fetchJson<WikipediaSummaryResponse>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidate.trim())}`,
      );
      if (!summary.extract?.trim()) continue;
      return {
        summary: summary.extract.trim(),
        ...(summary.content_urls?.desktop?.page ? { summaryUrl: summary.content_urls.desktop.page } : {}),
        ...(summary.thumbnail?.source ? { imageUrl: summary.thumbnail.source } : {}),
      };
    } catch {
      // Try the next name form.
    }
  }
  return undefined;
}

function stripUrlParameters(url: string): string {
  return url.split("?")[0];
}

function playableAudioUrl(info: CommonsVideoInfo): string | undefined {
  if (info.mime === "audio/mpeg" && info.url) return stripUrlParameters(info.url);
  const mp3Derivative = info.derivatives?.find((derivative) => derivative.type === "audio/mpeg" && derivative.src);
  if (mp3Derivative?.src) return stripUrlParameters(mp3Derivative.src);
  return undefined;
}

function hasBirdRecordingEvidence(page: CommonsPage, info: CommonsVideoInfo): boolean {
  const haystack = [
    page.title,
    metadataText(info, "Categories"),
    metadataText(info, "ImageDescription"),
    metadataText(info, "Credit"),
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes("xeno-canto") || haystack.includes("audio files of");
}

function relevantToSpecies(page: CommonsPage, info: CommonsVideoInfo, scientificName?: string, commonName?: string): boolean {
  if (!hasBirdRecordingEvidence(page, info)) return false;
  const haystack = [
    page.title,
    metadataText(info, "Categories"),
    metadataText(info, "ImageDescription"),
  ].filter(Boolean).join(" ").toLowerCase();
  const scientific = scientificName ? normalizeName(scientificName) : "";
  const common = commonName ? normalizeName(commonName) : "";
  return Boolean((scientific && haystack.includes(scientific)) || (common && haystack.includes(common)));
}

function soundRank(page: CommonsPage, info: CommonsVideoInfo, scientificName?: string): number {
  const duration = typeof info.duration === "number" && Number.isFinite(info.duration) ? info.duration : 999;
  const durationPenalty = duration >= 10 && duration <= 90 ? 0 : duration < 10 ? 1 : 2;
  const exactTitlePenalty = scientificName && page.title?.toLowerCase().includes(normalizeName(scientificName)) ? 0 : 1;
  return durationPenalty * 100 + exactTitlePenalty * 10 + (page.index ?? 99);
}

function xenoCantoRecordingKey(title: string, info: CommonsVideoInfo): string | undefined {
  const titleMatch = title.match(/\bXC\s*(\d+)\b/i);
  if (titleMatch) return `xc-${titleMatch[1]}`;
  const credit = metadataText(info, "Credit") ?? "";
  const creditMatch = credit.match(/xeno-canto\.org\/(?:chooseathumb\?html=)?(\d+)/i) ?? credit.match(/[?&]XC=(\d+)/i);
  return creditMatch ? `xc-${creditMatch[1]}` : undefined;
}

async function searchCommonsAudio(query: string): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:audio "${query.replace(/"/g, "")}"`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "videoinfo",
    viprop: "url|size|mime|derivatives|extmetadata",
    format: "json",
  });
  const payload = await fetchJson<CommonsResponse>(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  return Object.values(payload.query?.pages ?? {}).sort((left, right) => (left.index ?? 99) - (right.index ?? 99));
}

async function fetchCommonsSounds(scientificName?: string, commonName?: string): Promise<SpeciesGuideSound[]> {
  const queries = [scientificName, commonName]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => normalizeName(value) !== normalizeName(values[index - 1] ?? ""));
  for (const query of queries) {
    let pages: CommonsPage[] = [];
    try {
      pages = await searchCommonsAudio(query.trim());
    } catch {
      continue;
    }
    const soundsBeforeDedupe = pages.flatMap((page) => {
      const info = page.videoinfo?.[0];
      if (!page.title || !info) return [];
      const url = playableAudioUrl(info);
      const license = metadataText(info, "LicenseShortName") ?? metadataText(info, "UsageTerms");
      if (!url || !license || /\bnc\b|noncommercial/i.test(license)) return [];
      if (!relevantToSpecies(page, info, scientificName, commonName)) return [];
      return [{
        page,
        info,
        sound: {
          id: String(page.pageid ?? page.title),
          title: page.title.replace(/^File:/, "").replace(/\.(ogg|mp3|wav|flac)$/i, ""),
          url,
          ...(info.descriptionurl ? { descriptionUrl: info.descriptionurl } : {}),
          ...(metadataText(info, "Artist") ? { recordist: metadataText(info, "Artist") } : {}),
          license,
          ...(typeof info.duration === "number" && Number.isFinite(info.duration) ? { durationSeconds: Math.round(info.duration) } : {}),
          ...(recordingType(info) ? { recordingType: recordingType(info) } : {}),
          ...(recordingDescription(info) ? { description: recordingDescription(info) } : {}),
          source: "Wikimedia Commons / xeno-canto",
        } satisfies SpeciesGuideSound,
      }];
    })
      .sort((left, right) => soundRank(left.page, left.info, scientificName) - soundRank(right.page, right.info, scientificName));
    const seenRecordingKeys = new Set<string>();
    const sounds = soundsBeforeDedupe.flatMap((entry) => {
      const key = xenoCantoRecordingKey(entry.sound.title, entry.info) ?? `page-${entry.page.pageid ?? entry.sound.title}`;
      if (seenRecordingKeys.has(key)) return [];
      seenRecordingKeys.add(key);
      return [entry.sound];
    }).slice(0, 3);
    if (sounds.length) return sounds;
  }
  return [];
}

function inatLicenseLabel(code?: string | null): string | undefined {
  const normalized = code?.trim().toLowerCase();
  if (normalized === "cc0") return "CC0";
  if (normalized === "cc-by") return "CC BY";
  if (normalized === "cc-by-sa") return "CC BY-SA";
  return undefined;
}

function inatTaxonMatches(observation: InatObservationSound, scientificName?: string, commonName?: string): boolean {
  const taxon = observation.taxon;
  if (!taxon || taxon.iconic_taxon_name !== "Aves") return false;
  const scientific = scientificName ? normalizeName(scientificName) : "";
  const common = commonName ? normalizeName(commonName) : "";
  if (scientific) return Boolean(taxon.name && normalizeName(taxon.name) === scientific);
  return Boolean(common && taxon.preferred_common_name && normalizeName(taxon.preferred_common_name) === common);
}

function inatContext(observation: InatObservationSound): string | undefined {
  const cleanedDescription = cleanHtml(observation.description ?? undefined);
  if (cleanedDescription) return cleanedDescription.length > 170 ? `${cleanedDescription.slice(0, 167).trim()}…` : cleanedDescription;
  const parts = [
    observation.observed_on ? `Recorded ${observation.observed_on}` : undefined,
    observation.place_guess ? `in ${observation.place_guess}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

async function searchInaturalistSounds(query: string): Promise<InatObservationSound[]> {
  const params = new URLSearchParams({
    taxon_name: query,
    sounds: "true",
    per_page: "20",
    order_by: "votes",
  });
  const payload = await fetchJson<InatSoundResponse>(`https://api.inaturalist.org/v1/observations?${params.toString()}`);
  return payload.results ?? [];
}

async function fetchInaturalistSounds(scientificName?: string, commonName?: string): Promise<SpeciesGuideSound[]> {
  const queries = [scientificName, commonName]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => normalizeName(value) !== normalizeName(values[index - 1] ?? ""));
  for (const query of queries) {
    let observations: InatObservationSound[] = [];
    try {
      observations = await searchInaturalistSounds(query.trim());
    } catch {
      continue;
    }
    const sounds = observations
      .filter((observation) => inatTaxonMatches(observation, scientificName, commonName))
      .sort((left, right) => (left.quality_grade === "research" ? 0 : 1) - (right.quality_grade === "research" ? 0 : 1))
      .flatMap((observation) => (observation.sounds ?? []).flatMap((sound) => {
        const license = inatLicenseLabel(sound.license_code);
        if (!license || sound.hidden || !sound.file_url || !sound.id) return [];
        return [{
          id: `inat-${sound.id}`,
          title: `${observation.taxon?.preferred_common_name ?? commonName ?? scientificName ?? "Bird"} field recording`,
          url: sound.file_url,
          ...(observation.uri ? { descriptionUrl: observation.uri } : {}),
          ...(observation.user?.name || observation.user?.login ? { recordist: observation.user.name ?? observation.user.login } : {}),
          license,
          recordingType: "field recording",
          ...(inatContext(observation) ? { description: inatContext(observation) } : {}),
          source: "iNaturalist",
        } satisfies SpeciesGuideSound];
      }))
      .sort((left, right) => Number(left.url.includes(".wav")) - Number(right.url.includes(".wav")))
      .slice(0, 3);
    if (sounds.length) return sounds;
  }
  return [];
}

async function fetchGuideSounds(scientificName?: string, commonName?: string): Promise<SpeciesGuideSound[]> {
  const [commonsSounds, inaturalistSounds] = await Promise.all([
    fetchCommonsSounds(scientificName, commonName).catch(() => []),
    fetchInaturalistSounds(scientificName, commonName).catch(() => []),
  ]);
  const seenUrls = new Set<string>();
  return [...commonsSounds, ...inaturalistSounds].filter((sound) => {
    if (seenUrls.has(sound.url)) return false;
    seenUrls.add(sound.url);
    return true;
  }).slice(0, 3);
}

export async function fetchSpeciesGuide(scientificName?: string, commonName?: string): Promise<SpeciesGuide> {
  const key = `${normalizeName(scientificName ?? "")}|${normalizeName(commonName ?? "")}`;
  const cached = guideCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.guide;
  const [summary, sounds] = await Promise.all([
    fetchWikipediaSummary(scientificName, commonName).catch(() => undefined),
    fetchGuideSounds(scientificName, commonName).catch(() => []),
  ]);
  const guide: SpeciesGuide = {
    ...(summary?.summary ? { summary: summary.summary } : {}),
    ...(summary?.summaryUrl ? { summaryUrl: summary.summaryUrl } : {}),
    ...(summary?.imageUrl ? { imageUrl: summary.imageUrl } : {}),
    sounds,
    sources: {
      ...(summary?.summaryUrl ? { encyclopedia: "Wikipedia" } : {}),
      ...(sounds.length ? { audio: [...new Set(sounds.map((sound) => sound.source ?? "Wikimedia Commons / xeno-canto"))].join(" / ") } : {}),
    },
  };
  const now = Date.now();
  for (const [cacheKey, entry] of guideCache) {
    if (entry.expiresAt <= now) guideCache.delete(cacheKey);
  }
  if (!guideCache.has(key) && guideCache.size >= GUIDE_CACHE_MAX_ENTRIES) {
    const oldestKey = guideCache.keys().next().value;
    if (oldestKey) guideCache.delete(oldestKey);
  }
  guideCache.set(key, { guide, expiresAt: now + GUIDE_CACHE_TTL_MS });
  return guide;
}
