"use server";

import { simulateBertaReply } from "@/lib/agent";
import { requireCrmWorkspace } from "@/lib/crm-workspace";
import { messageLimit, promptLimit } from "./prompt-limits";

export async function testBertaPrompt(instructions: string, message: string) {
  await requireCrmWorkspace({ adminOnly: true });
  if (process.env.VERCEL_ENV !== "preview") {
    return { error: "El simulador está disponible en el entorno de pruebas." };
  }
  if (typeof instructions !== "string" || instructions.length > promptLimit ||
      typeof message !== "string" || message.length > messageLimit || !message.trim()) {
    return { error: "Ingresá un mensaje de prueba y respetá los límites de caracteres." };
  }
  try {
    const reply = await simulateBertaReply(instructions.trim(), message.trim());
    return { reply };
  } catch {
    return { error: "No se pudo obtener una respuesta del modelo. Volvé a intentarlo en unos minutos." };
  }
}
