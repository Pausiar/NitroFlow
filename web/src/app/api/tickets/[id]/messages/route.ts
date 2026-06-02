import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase-service";
import { analyzeTicketWithNim } from "@/lib/nim";

const messageSchema = z.object({
  message: z.string().min(1).max(5000)
});

type Role = "user" | "admin";

const getRole = async (userId: string): Promise<Role> => {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return data?.role === "admin" ? "admin" : "user";
};

const getTicketForUser = async (ticketId: string, userId: string, role: Role) => {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tickets")
    .select("id, user_id, subject, ai_enabled, claimed_by")
    .eq("id", ticketId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  if (role !== "admin" && data.user_id !== userId) {
    return null;
  }

  return data;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getRole(user.id);
  const { id } = await params;
  const ticket = await getTicketForUser(id, user.id, role);
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adminClient = createServiceClient();
  const { data: messages, error } = await adminClient
    .from("ticket_messages")
    .select("id, sender, sender_user_id, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "No se pudieron cargar los mensajes" }, { status: 503 });
  }

  return NextResponse.json({
    ticket,
    messages: messages || []
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = messageSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const role = await getRole(user.id);
  const { id } = await params;
  const ticket = await getTicketForUser(id, user.id, role);
  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adminClient = createServiceClient();
  const sender = role === "admin" ? "admin" : "user";

  const { error: insertError } = await adminClient.from("ticket_messages").insert({
    ticket_id: id,
    sender,
    sender_user_id: user.id,
    body: payload.data.message
  });

  if (insertError) {
    return NextResponse.json({ error: "No se pudo guardar el mensaje" }, { status: 503 });
  }

  if (role === "admin") {
    await adminClient
      .from("tickets")
      .update({
        ai_enabled: false,
        claimed_by: user.id,
        claimed_at: new Date().toISOString(),
        status: "open",
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, responder: "admin" });
  }

  if (ticket.ai_enabled) {
    try {
      const analysis = await analyzeTicketWithNim({
        subject: ticket.subject,
        message: payload.data.message,
        projectContext: "Conversacion de soporte en curso para NitroFlow."
      });

      await adminClient.from("ticket_messages").insert({
        ticket_id: id,
        sender: "ai",
        body: analysis.userResponse
      });

      await adminClient
        .from("tickets")
        .update({
          ai_response: analysis.userResponse,
          ai_error_summary: analysis.adminSummary,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      return NextResponse.json({ ok: true, responder: "ai" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI unavailable";
      await adminClient.from("admin_alerts").insert({
        ticket_id: id,
        title: "Asistente IA no disponible o lento",
        message: `No se pudo procesar IA para el ticket ${id}: ${message}`
      });

      return NextResponse.json({ ok: true, responder: "none" });
    }
  }

  return NextResponse.json({ ok: true, responder: "none" });
}
