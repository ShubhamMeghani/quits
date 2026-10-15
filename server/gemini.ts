import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ReceiptModelClient } from "@/lib/receipt";

let ai: GoogleGenAI | null = null;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
}

/** Server-only Gemini client with structured JSON output (R31). */
export const geminiReceiptClient: ReceiptModelClient = async ({ imageBase64, mimeType, prompt, jsonSchema, signal }) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  ai ??= new GoogleGenAI({ apiKey: key });
  const res = await ai.models.generateContent({
    model: geminiModel(),
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      temperature: 0,
      abortSignal: signal,
    },
  });
  const text = res.text;
  if (!text) throw new Error("empty model response");
  return text;
};
