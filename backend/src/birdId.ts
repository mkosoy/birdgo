export interface BirdIdentification {
  isBird: boolean;
  commonName: string | null;
  sciName: string | null;
  confidence: number;
}

export type BirdIdProvider = "openai" | "heuristic";

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
}

function seededIndex(seed: string, length: number): number {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % length;
}

function heuristicIdentify(hints: string[]): BirdIdentification {
  const species = hints.length ? hints[seededIndex(hints.join("|"), hints.length)] : "Anna's Hummingbird";
  const scientificNames: Record<string, string> = {
    "Anna's Hummingbird": "Calypte anna",
    "American Robin": "Turdus migratorius",
    "Red-tailed Hawk": "Buteo jamaicensis",
    "California Scrub-Jay": "Aphelocoma californica",
  };
  return {
    isBird: true,
    commonName: species,
    sciName: scientificNames[species] ?? null,
    confidence: hints.length ? 0.6 : 0.5,
  };
}

function parseIdentification(content: string): BirdIdentification {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("OpenAI returned no JSON object");
  const parsed = JSON.parse(jsonMatch[0]) as Partial<BirdIdentification>;
  return {
    isBird: Boolean(parsed.isBird),
    commonName: typeof parsed.commonName === "string" ? parsed.commonName : null,
    sciName: typeof parsed.sciName === "string" ? parsed.sciName : null,
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
  };
}

async function openAiIdentify(
  imageBase64: string,
  apiKey: string,
): Promise<BirdIdentification> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Is this a bird? If yes, return the most likely species common name and scientific name. Respond as strict JSON {\"isBird\":boolean,\"commonName\":string|null,\"sciName\":string|null,\"confidence\":number}.",
            },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
  const body = (await response.json()) as OpenAiResponse;
  const content = body.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("")
        : "";
  return parseIdentification(text);
}

export async function identifyBird(
  imageBase64: string,
  hints: string[],
  provider: BirdIdProvider,
  openAiKey?: string,
): Promise<BirdIdentification & { provider: BirdIdProvider }> {
  const result =
    provider === "openai" && openAiKey
      ? await openAiIdentify(imageBase64, openAiKey)
      : heuristicIdentify(hints);
  return { ...result, provider: provider === "openai" && openAiKey ? "openai" : "heuristic" };
}
