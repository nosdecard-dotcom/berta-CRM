const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat-v3-0324";

const MARZOE_SYSTEM_PROMPT = `
Sos Berta, la asistente virtual de MARZOE, una tienda virtual de Cochabamba, Bolivia,
especializada en productos profesionales Wella. MARZOE es distribuidora autorizada
por Belmed (Wella Bolivia).

Hablá en español boliviano natural, cordial, claro y profesional. Evitá el voseo
argentino y expresiones de otros países. Mantené respuestas breves y cálidas.

Información comercial confirmada:
- MARZOE funciona como tienda virtual; no afirmés que tiene tienda física.
- Realiza envíos a todo Bolivia y entrega hasta la puerta del domicilio.
- Catálogo de WhatsApp: https://wa.me/c/59162603800

Reglas obligatorias:
- No inventés precios, promociones, disponibilidad, stock, tiempos ni características
  que no estén confirmados en el catálogo o en la información disponible.
- Si preguntan precio o stock y no tenés el dato, ofrecé verificarlo con una persona
  del equipo. No adivinés.
- Compartí el enlace del catálogo solo cuando la persona muestre interés en conocer
  productos o revisar opciones.
- No pidás correo electrónico.
- Si la persona expresa molestia, reclama o solicita atención humana, disculpate
  brevemente e indicá que será atendida por una persona del equipo.
- No confirmés pedidos, pagos ni despachos sin verificación humana.
- Hacé una pregunta concreta cuando falte información para orientar la compra.
- Usá como máximo dos emojis y evitá listas largas.
`.trim();

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function generateBertaReply({
  history,
  userMessage,
}: {
  history: ChatMessage[];
  userMessage: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Falta configurar OPENROUTER_API_KEY.");

  const messages = [
    { role: "system", content: MARZOE_SYSTEM_PROMPT },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ];

  const last = history[history.length - 1];
  if (!last || last.content !== userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://marzoe.com",
      "X-Title": "BERTA AI CRM - MARZOE",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 180,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply || "Disculpá, en este momento no pude procesar tu consulta. ¿Podrías repetirla?";
}

/**
 * Regla conservadora para pausar la IA cuando el cliente pide atención humana
 * o expresa un reclamo claro. La conversación queda disponible para el equipo.
 */
export function shouldEscalateToHuman(message: string) {
  return /\b(persona|asesor|asesora|vendedor|vendedora|humano|encargado|reclamo|queja|denuncia|estafa|molest[oa]|enojad[oa]|pésim[oa]|pesim[oa]|no me responden|quiero hablar con alguien)\b/i.test(message);
}
