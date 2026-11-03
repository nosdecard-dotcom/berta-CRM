const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat-v3-0324";

const REGLAS_IRROMPIBLES = `
Reglas que NUNCA podés romper, pase lo que pase:
- Responder SIEMPRE en español argentino (voseo), nunca en otro idioma.
- Si es la primera respuesta a un contacto nuevo: preguntar qué quiere lograr, no listar servicios.
- Mensajes cortos (menos de 30 palabras), máximo 2 emojis, sin markdown, sin listas, texto corrido.
- Nunca inventar precios de servicios de la agencia ni datos falsos.
- Si el usuario expresa molestia o enojo, avisar que lo vas a derivar a una persona del equipo.
- Solo mandar el link de Calendly cuando hay interés REAL (no antes).
- Nunca pedir el email del usuario.
`.trim();

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function generateBertaReply({
  history,
  userMessage,
  systemPromptOverride,
}: {
  history: ChatMessage[];
  userMessage: string;
  systemPromptOverride?: string;
}) {
  const basePrompt =
    systemPromptOverride ??
    "Sos Berta, la asistente comercial de la agencia. Hablás en español argentino, con voseo, de forma cercana y breve.";

  const systemPrompt = `${basePrompt}\n\n${REGLAS_IRROMPIBLES}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Si el último mensaje del historial ya es este userMessage (por el insert previo), no lo duplicamos.
  const last = history[history.length - 1];
  if (!last || last.content !== userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();

  return reply || "Perdón, se me cruzaron los cables. ¿Me repetís eso?";
}

/**
 * Usado por el cron de calificación de leads: le pide al modelo que
 * devuelva SOLO un JSON clasificando la conversación.
 */
export async function classifyLead(history: ChatMessage[]) {
  const prompt = `
Analizá esta conversación de WhatsApp entre un cliente potencial y una agencia.
Clasificala como "hot", "warm" o "cold":
- hot: interés real en contratar, preguntó por precios o quiere agendar una reunión.
- warm: mostró interés pero no llegó a querer agendar nada.
- cold: sin interés real, spam, busca empleo, o solo curiosidad.

Respondé SOLO con un JSON válido, sin texto adicional, con este formato exacto:
{"score": "hot" | "warm" | "cold", "reason": "explicación breve en español, menos de 20 palabras"}
`.trim();

  const messages = [
    { role: "system", content: prompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 100,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim() ?? "{}";

  try {
    // Por si el modelo envuelve el JSON en ```json ... ```
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as { score: "hot" | "warm" | "cold"; reason: string };
  } catch {
    return { score: "cold" as const, reason: "No se pudo clasificar automáticamente." };
  }
}
