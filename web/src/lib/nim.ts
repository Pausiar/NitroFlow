import OpenAI from "openai";
import { env } from "@/lib/env";

const AI_TIMEOUT_MS = Number(process.env.AI_PROVIDER_TIMEOUT_MS || process.env.NVIDIA_NIM_TIMEOUT_MS || "12000");
const AI_FALLBACK_MODELS = ["z-ai/glm-5.1", "zai-org/glm-5.1", "glm-5.1"];

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export const analyzeTicketWithNim = async (input: {
  subject: string;
  message: string;
  projectContext?: string;
}) => {
  if (!env.aiProviderApiKey) {
    return {
      userResponse:
        "Hemos recibido tu ticket y un agente humano lo revisara en breve.",
      adminSummary: "Proveedor de IA no configurado"
    };
  }

  const baseUrl = (env.aiProviderBaseUrl || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const client = new OpenAI({ baseURL: baseUrl, apiKey: env.aiProviderApiKey });

  const modelCandidates = Array.from(
    new Set([env.aiProviderModel, ...AI_FALLBACK_MODELS].filter(Boolean))
  );

  let lastError: Error | null = null;
  for (const model of modelCandidates) {
    try {
      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                "Eres el asistente de soporte de NitroFlow. Responde de forma clara y breve: causa probable, pasos concretos y verificacion final."
            },
            {
              role: "user",
              content: `Ticket: ${input.subject}\n\nDescripcion: ${input.message}\n\nContexto del proyecto: ${input.projectContext || "No provisto"}`
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
          max_tokens: 700
        }),
        AI_TIMEOUT_MS
      );

      const content =
        completion.choices[0]?.message?.content?.trim() ||
        "No se pudo generar una respuesta automatica.";

      return {
        userResponse: content,
        adminSummary: `[model=${model}] ${content.slice(0, 560)}`
      };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      const message = err instanceof Error ? err.message : "AI request failed";
      lastError = new Error(`[model=${model}] status=${status ?? "unknown"} ${message}`);

      if (status && status !== 404) {
        break;
      }
    }
  }

  throw lastError || new Error("AI request failed");
};
