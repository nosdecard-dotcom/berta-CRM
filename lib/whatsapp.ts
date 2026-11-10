const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppMessage(to: string, text: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("Faltan WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_ACCESS_TOKEN.");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp Cloud API error ${res.status}: ${errText}`);
  }

  const result = await res.json() as { messages?: { id?: unknown }[] } | null;
  const id = result?.messages?.[0]?.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("WhatsApp Cloud API no devolvió un identificador de mensaje.");
  }
  return { messages: [{ id }] };
}
