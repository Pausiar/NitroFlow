import OpenAI from "openai";
import { env } from "@/lib/env";

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

  const client = new OpenAI({
    baseURL: env.nvidiaBaseUrl,
    apiKey: env.nvidiaApiKey
  });

  const completion = await client.chat.completions.create({
    model: env.nvidiaModel,
    messages: [
      {
        role: "system",
        content:
          "Eres el asistente de soporte de NitroFlow. Analiza errores reportados por usuarios, propone causa probable y solucion clara. Responde en espanol neutro."
      },
      {
        role: "user",
        content: `Ticket: ${input.subject}\n\nDescripcion: ${input.message}\n\nContexto del proyecto: ${input.projectContext || "No provisto"}`
      }
    ],
    temperature: 1,
    top_p: 1,
    max_tokens: 16384,
    extra_body: {
      chat_template_kwargs: {
        enable_thinking: true,
        clear_thinking: false
      }
    }
  } as any);

  const content = completion.choices[0]?.message?.content?.trim() ||
    "No se pudo generar una respuesta automatica.";

  return {
    userResponse: content,
    adminSummary: content.slice(0, 800)
  };
};
