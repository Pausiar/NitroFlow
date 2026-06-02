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
      .select("id, subject, status, ai_enabled, claimed_by, claimed_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "No se pudieron cargar los tickets" }, { status: 503 });
    }

    return NextResponse.json({ tickets: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
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
  } catch {
    return NextResponse.json({ error: "Servicio no disponible" }, { status: 503 });
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
      message: payload.data.message,
      ai_enabled: true,
      status: "open"
    })
    .select("id, subject")
    .single();

  if (insertError || !ticket) {
    return NextResponse.json({ error: "No se pudo guardar el ticket" }, { status: 500 });
  }

  await supabase.from("ticket_messages").insert({
    ticket_id: ticket.id,
    sender: "user",
    sender_user_id: user.id,
    body: payload.data.message
  });

  let analysis = {
    userResponse:
      "Hemos recibido tu ticket y un agente humano lo revisara en breve.",
    adminSummary: "Sin analisis IA disponible."
  };
  let aiGenerated = false;
  let aiErrorMessage: string | null = null;
  try {
    analysis = await analyzeTicketWithNim({
      subject: ticket.subject,
      message: payload.data.message,
      projectContext:
        "NitroFlow desktop (Electron) + NitroFlow web (Next.js, Supabase, Stripe)."
    });
    aiGenerated = true;
  } catch (err) {
    aiErrorMessage = err instanceof Error ? err.message : "AI unavailable";
    // mantenemos respuesta por defecto si falla el asistente
  }

  try {
    const adminClient = createServiceClient();
    if (aiGenerated) {
      await adminClient.from("ticket_messages").insert({
        ticket_id: ticket.id,
        sender: "ai",
        body: analysis.userResponse
      });

      await adminClient
        .from("tickets")
        .update({ ai_response: analysis.userResponse, ai_error_summary: analysis.adminSummary })
        .eq("id", ticket.id);
    }

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
        title: "Asistente IA no disponible o lento",
        message: `No se pudo procesar IA para el ticket ${ticket.id}: ${aiErrorMessage}`
      });
    }
  } catch {
    // si falta configuracion de servicio, el ticket existe igualmente
  }

  return NextResponse.json({
    ticketId: ticket.id,
    aiResponse: aiGenerated ? analysis.userResponse : null
  });
}
