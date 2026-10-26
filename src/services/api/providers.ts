import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { LlmProvider } from "../../types";

export interface LlmRequest {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  apiKey: string;
  model: string;
}

// Each provider enforces the same JSON schema natively and returns the raw JSON text.
// Calls go straight from the webview: this is a local desktop tool using the user's own keys.

async function anthropic(r: LlmRequest): Promise<string> {
  const client = new Anthropic({ apiKey: r.apiKey, dangerouslyAllowBrowser: true });
  // Server-side fallback re-runs a safety-classifier decline on another model; Haiku has no fallback.
  const fallback = r.model.includes("haiku")
    ? {}
    : { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] };
  const msg = await client.beta.messages.create({
    model: r.model,
    max_tokens: 16000,
    system: r.system,
    messages: [{ role: "user", content: r.user }],
    output_config: { format: { type: "json_schema", schema: r.schema } },
    ...fallback,
  });
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to write this storyboard.");
  if (msg.stop_reason === "max_tokens") throw new Error("Claude hit the output token limit.");
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

async function openai(r: LlmRequest): Promise<string> {
  const client = new OpenAI({ apiKey: r.apiKey, dangerouslyAllowBrowser: true });
  const res = await client.chat.completions.create({
    model: r.model,
    messages: [
      { role: "system", content: r.system },
      { role: "user", content: r.user },
    ],
    response_format: { type: "json_schema", json_schema: { name: "storyboard", strict: true, schema: r.schema } },
  });
  const message = res.choices[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI declined: ${message.refusal}`);
  return message?.content ?? "";
}

async function gemini(r: LlmRequest): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: r.apiKey });
  const res = await ai.models.generateContent({
    model: r.model,
    contents: r.user,
    config: { systemInstruction: r.system, responseMimeType: "application/json", responseJsonSchema: r.schema },
  });
  return res.text ?? "";
}

export const PROVIDERS: Record<LlmProvider, (r: LlmRequest) => Promise<string>> = { anthropic, openai, gemini };

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5-mini",
  gemini: "gemini-2.5-flash",
};
