export interface BirdIdentification {
  isBird: boolean;
  commonName: string | null;
  sciName: string | null;
  confidence: number;
}

export type BirdIdProvider = "heuristic" | "huggingface" | "gemini" | "openai";

export interface BirdIdKeys {
  huggingface?: string;
  gemini?: string;
  openai?: string;
  huggingfaceModel?: string;
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

interface HuggingFacePrediction {
  label?: unknown;
  score?: unknown;
}

const IDENTIFICATION_PROMPT =
  'Is this a bird? If yes, return the most likely species common name and scientific name. Respond as strict JSON {"isBird":boolean,"commonName":string|null,"sciName":string|null,"confidence":number}.';

function heuristicIdentify(): BirdIdentification {
  return {
    isBird: false,
    commonName: null,
    sciName: null,
    confidence: 0,
  };
}

function parseIdentification(content: string): BirdIdentification {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Bird identification provider returned no JSON object");
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

function imageBytes(imageBase64: string): Uint8Array {
  const encoded = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
  return Buffer.from(encoded, "base64");
}

async function openAiIdentify(imageBase64: string, apiKey: string): Promise<BirdIdentification> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: IDENTIFICATION_PROMPT },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
  const body = (await response.json()) as OpenAiResponse;
  const content = body.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : "";
  return parseIdentification(text);
}

async function geminiIdentify(imageBase64: string, apiKey: string): Promise<BirdIdentification> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: IDENTIFICATION_PROMPT },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64.replace(/^data:image\/[^;]+;base64,/, "") } },
          ],
        }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini request failed with status ${response.status}`);
  const body = (await response.json()) as GeminiResponse;
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return parseIdentification(text);
}

async function huggingFaceIdentify(
  imageBase64: string,
  apiKey: string,
  model: string,
): Promise<BirdIdentification> {
  const url = `https://api-inference.huggingface.co/models/${model}`;
  const request = () => fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/octet-stream",
    },
    body: imageBytes(imageBase64) as BodyInit,
  });
  let response = await request();
  if (response.status === 503) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    response = await request();
  }
  if (!response.ok) throw new Error(`Hugging Face request failed with status ${response.status}`);
  const predictions = (await response.json()) as HuggingFacePrediction[];
  const top = predictions[0];
  if (!top || typeof top.label !== "string" || typeof top.score !== "number") {
    throw new Error("Hugging Face returned no prediction");
  }
  return {
    isBird: true,
    commonName: top.label,
    sciName: null,
    confidence: Math.max(0, Math.min(1, top.score)),
  };
}

export async function identifyBird(
  imageBase64: string,
  hints: string[],
  provider: BirdIdProvider,
  keys: BirdIdKeys,
): Promise<BirdIdentification & { provider: BirdIdProvider }> {
  if (provider === "heuristic") return { ...heuristicIdentify(), provider: "heuristic" };
  try {
    if (provider === "huggingface" && keys.huggingface) {
      return {
        ...(await huggingFaceIdentify(
          imageBase64,
          keys.huggingface,
          keys.huggingfaceModel ?? "dennisjooo/Birds-Classifier-EfficientNetB2",
        )),
        provider: "huggingface",
      };
    }
    if (provider === "gemini" && keys.gemini) {
      return { ...(await geminiIdentify(imageBase64, keys.gemini)), provider: "gemini" };
    }
    if (provider === "openai" && keys.openai) {
      return { ...(await openAiIdentify(imageBase64, keys.openai)), provider: "openai" };
    }
  } catch (error) {
    console.error(`${provider} bird identification failed; using heuristic fallback`, error);
  }
  return { ...heuristicIdentify(), provider: "heuristic" };
}
