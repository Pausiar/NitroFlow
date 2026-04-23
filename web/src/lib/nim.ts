import OpenAI from "openai";
import { env } from "@/lib/env";

const NIM_TIMEOUT_MS = Number(process.env.NVIDIA_NIM_TIMEOUT_MS || "12000");
const NIM_FALLBACK_MODELS = ["z-ai/glm-5.1", "zai-org/glm-5.1", "glm-5.1"];

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("NIM_TIMEOUT")), timeoutMs);
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
  if (!env.nvidiaApiKey) {
    return {
      userResponse:
        "No pude analizar con IA porque falta configurar NVIDIA NIM API key en el servidor.",
      adminSummary: "NVIDIA NIM API key no configurada"
    };
  }

  const baseUrl = (env.nvidiaBaseUrl || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const client = new OpenAI({ baseURL: baseUrl, apiKey: env.nvidiaApiKey });

  const modelCandidates = Array.from(
    new Set([env.nvidiaModel, ...NIM_FALLBACK_MODELS].filter(Boolean))
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
        } as any),
        NIM_TIMEOUT_MS
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
      const message = err instanceof Error ? err.message : "NIM request failed";
      lastError = new Error(`[model=${model}] status=${status ?? "unknown"} ${message}`);

      if (status && status !== 404) {
        break;
      }
    }
  }

  throw lastError || new Error("NIM request failed");
};
