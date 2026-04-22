import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase-service";
import { analyzeTicketWithNim } from "@/lib/nim";

const isLikelyTestTicket = (subject: string, message: string) => {
  const text = `${subject} ${message}`.toLowerCase();
  return /(\btest\b|\bprueba\b|testing|hola|asd)/.test(text);
};

const hasMeaningfulSummary = (summary: string) => {
  const normalized = summary.trim().toLowerCase();
  return normalized.length > 25 && normalized !== "sin analisis ia disponible.";
};

const schema = z.object({
  subject: z.string().min(4).max(120),
  message: z.string().min(10).max(5000)
});

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("tickets")
      .select("id, subject, message, status, ai_response, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tickets: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const payload = schema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Supabase no configurado" },
      { status: 500 }
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: ticket, error: insertError } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      subject: payload.data.subject,
      message: payload.data.message
    })
    .select("id")
    .single();

  if (insertError || !ticket) {
    return NextResponse.json({ error: "No se pudo guardar el ticket" }, { status: 500 });
  }

  let analysis = {
    userResponse:
      "Hemos recibido tu ticket y un agente humano lo revisara en breve.",
    adminSummary: "Sin analisis IA disponible."
  };
  let aiGenerated = false;
  let aiErrorMessage: string | null = null;
  try {
    analysis = await analyzeTicketWithNim({
      subject: payload.data.subject,
      message: payload.data.message,
      projectContext:
        "NitroFlow desktop (Electron) + NitroFlow web (Next.js, Supabase, Stripe)."
    });
    aiGenerated = true;
  } catch (err) {
    aiErrorMessage = err instanceof Error ? err.message : "NIM unavailable";
    // mantenemos respuesta por defecto si falla NIM
  }

  try {
    const adminClient = createServiceClient();
    await adminClient
      .from("tickets")
      .update({
        ai_response: analysis.userResponse,
        ai_error_summary: analysis.adminSummary,
        status: aiGenerated ? "answered" : "open"
      })
      .eq("id", ticket.id);

    const shouldAlertAdmin =
      aiGenerated &&
      hasMeaningfulSummary(analysis.adminSummary) &&
      !isLikelyTestTicket(payload.data.subject, payload.data.message);

    if (shouldAlertAdmin) {
      await adminClient.from("admin_alerts").insert({
        ticket_id: ticket.id,
        title: `Posible fallo detectado: ${payload.data.subject}`,
        message: analysis.adminSummary
      });
    } else if (aiErrorMessage) {
      await adminClient.from("admin_alerts").insert({
        ticket_id: ticket.id,
        title: "NIM no disponible o lento",
        message: `No se pudo procesar IA para el ticket ${ticket.id}: ${aiErrorMessage}`
      });
    }
  } catch {
    // si falta service key, el ticket existe y la IA respondio igualmente al usuario
  }

  return NextResponse.json({
    ticketId: ticket.id,
    aiResponse: analysis.userResponse
  });
}
