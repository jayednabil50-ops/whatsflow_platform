const DEFAULT_ADMIN_WHATSAPP = "8801XXXXXXXXX";

function getAdminWhatsAppDigits(): string {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_WHATSAPP ||
    process.env.WHATSFLOW_ADMIN_WHATSAPP ||
    DEFAULT_ADMIN_WHATSAPP;
  return raw.replace(/\D/g, "");
}

export function buildBuyPlanWhatsAppUrl(plan: {
  name: string;
  price: string;
  duration: string;
  sessions: string;
}): string {
  const number = getAdminWhatsAppDigits();
  const message =
    `Hello WhatsFlow team,\n\n` +
    `I want to buy the ${plan.name} plan.\n` +
    `Price: ${plan.price} ${plan.duration}\n` +
    `Includes: ${plan.sessions}\n\n` +
    `Please share payment details.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function buildGenericContactWhatsAppUrl(topic: string): string {
  const number = getAdminWhatsAppDigits();
  const message = `Hello WhatsFlow team,\n\n${topic}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
