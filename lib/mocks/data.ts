import {
  Activity,
  BellRing,
  Bot,
  Cable,
  ChartNoAxesCombined,
  CheckCircle2,
  Code2,
  DatabaseZap,
  FileText,
  Globe2,
  KeyRound,
  Layers3,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  MessageSquareText,
  PlugZap,
  Radar,
  Send,
  ServerCog,
  ShieldCheck,
  Smartphone,
  UsersRound,
  Webhook,
  Workflow,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SessionStatus = "connected" | "connecting" | "disconnected" | "error";

export type MockSession = {
  id: string;
  name: string;
  phone: string;
  status: SessionStatus;
  todayMessages: number;
  receivedToday: number;
  lastActivity: string;
  healthScore: number;
  queueDepth: number;
  safetyProfile: "Strict" | "Balanced" | "High throughput";
  webhookUrl: string;
  uptime: string;
  apiKeyPrefix: string;
  device: string;
  location: string;
};

export const mockSessions: MockSession[] = [
  {
    id: "s_001",
    name: "Support Line",
    phone: "+8801712345678",
    status: "connected",
    todayMessages: 1231,
    receivedToday: 842,
    lastActivity: "2m ago",
    healthScore: 98,
    queueDepth: 7,
    safetyProfile: "Balanced",
    webhookUrl: "https://acme.co/api/whatsapp/support",
    uptime: "99.96%",
    apiKeyPrefix: "wfk_live_84c2",
    device: "Pixel 8 Pro",
    location: "Dhaka, BD"
  },
  {
    id: "s_002",
    name: "Sales Bot",
    phone: "+8801812345678",
    status: "connecting",
    todayMessages: 584,
    receivedToday: 211,
    lastActivity: "14m ago",
    healthScore: 91,
    queueDepth: 18,
    safetyProfile: "Strict",
    webhookUrl: "https://acme.co/api/whatsapp/sales",
    uptime: "99.82%",
    apiKeyPrefix: "wfk_live_19aa",
    device: "Galaxy S24",
    location: "Singapore"
  },
  {
    id: "s_003",
    name: "Order Updates",
    phone: "+8801912345678",
    status: "connected",
    todayMessages: 2680,
    receivedToday: 93,
    lastActivity: "34s ago",
    healthScore: 96,
    queueDepth: 3,
    safetyProfile: "High throughput",
    webhookUrl: "https://acme.co/api/whatsapp/orders",
    uptime: "99.99%",
    apiKeyPrefix: "wfk_live_55df",
    device: "iPhone 15",
    location: "Frankfurt, DE"
  }
];

export const mockUsage = [
  { day: "Mon", sent: 1220, received: 890, failed: 12 },
  { day: "Tue", sent: 1432, received: 1002, failed: 9 },
  { day: "Wed", sent: 1880, received: 1111, failed: 7 },
  { day: "Thu", sent: 2164, received: 1440, failed: 14 },
  { day: "Fri", sent: 2401, received: 1610, failed: 8 },
  { day: "Sat", sent: 2120, received: 1290, failed: 6 },
  { day: "Sun", sent: 2618, received: 1718, failed: 11 }
];

export const planSummary = {
  name: "2-day trial",
  status: "Trial",
  sessionsUsed: 1,
  sessionsLimit: 1,
  trialEnds: "2 days from signup",
  included: "1 session during trial, full API access, webhooks, and upgrade path to keep numbers active"
};

export const landingStats = [
  { label: "API uptime target", value: "99.9%" },
  { label: "Webhook events", value: "22+" },
  { label: "Message types", value: "12" },
  { label: "SDK paths", value: "4" }
];

export const featureCards: Array<{
  icon: LucideIcon;
  title: string;
  body: string;
}> = [
  {
    icon: Cable,
    title: "Multi-session WhatsApp API",
    body: "Connect several customer-facing numbers, isolate API keys per session, and route traffic by product, region, or team."
  },
  {
    icon: Webhook,
    title: "Realtime webhooks",
    body: "Receive session status, inbound messages, delivery receipts, group events, reactions, and webhook retry telemetry."
  },
  {
    icon: ShieldCheck,
    title: "Account Protection Mode",
    body: "Use consent-first workflows, paced queues, concurrency controls, and endpoint risk labels to reduce restriction risk."
  },
  {
    icon: Code2,
    title: "Developer-first REST API",
    body: "Simple bearer auth, copy-ready examples, media upload support, predictable error responses, and request limit headers."
  },
  {
    icon: Layers3,
    title: "Users, groups, and channels",
    body: "Send to private chats, groups, and announcement channels from the same session with consistent payloads."
  },
  {
    icon: DatabaseZap,
    title: "Client-ready data model",
    body: "Profiles, sessions, tokens, messages, webhook deliveries, usage, and subscriptions are already mapped for Supabase."
  }
];

export const messageTypes = [
  { icon: MessageSquareText, label: "Text" },
  { icon: FileText, label: "Documents" },
  { icon: Smartphone, label: "Media" },
  { icon: BellRing, label: "Voice" },
  { icon: UsersRound, label: "Contacts" },
  { icon: Globe2, label: "Locations" },
  { icon: Activity, label: "Presence" },
  { icon: ChartNoAxesCombined, label: "Polls" }
];

export const sdkCards = [
  { name: "Node.js", label: "Full TypeScript SDK", command: "npm i @whatsflow/sdk" },
  { name: "Python", label: "Async-friendly client", command: "pip install whatsflow" },
  { name: "Laravel", label: "Service provider ready", command: "composer require whatsflow/laravel" },
  { name: "n8n", label: "Automation node", command: "n8n install whatsflow-node" }
];

export const processSteps = [
  {
    title: "Create a session",
    body: "Choose a number, assign a safety profile, enable selected webhook events, and create an isolated API key."
  },
  {
    title: "Scan and verify",
    body: "Scan the QR code, confirm connection health, and keep a live view of queue depth and session status."
  },
  {
    title: "Send and monitor",
    body: "Send messages through REST calls while the dashboard tracks delivery, retries, limits, and webhook latency."
  }
];

export const useCases = [
  {
    title: "Support automation",
    body: "Create a customer support lane with inbound webhooks, handoff signals, and a searchable message log."
  },
  {
    title: "Order and delivery alerts",
    body: "Send receipts, status updates, shipping links, appointment reminders, and post-purchase follow-ups."
  },
  {
    title: "Lead nurturing",
    body: "Move opted-in leads through paced follow-up sequences with CRM sync and reply-triggered workflows."
  },
  {
    title: "AI assistant routing",
    body: "Connect agents to inbound events and give them safe tools for messages, contacts, groups, and status checks."
  },
  {
    title: "Internal operations",
    body: "Notify managers about approvals, inventory, incidents, attendance, and payment events."
  },
  {
    title: "Community updates",
    body: "Send moderated announcements to groups and channels without mixing customer sessions."
  }
];

export const pricingPlans = [
  {
    name: "Starter",
    price: "৳299",
    duration: "/month",
    sessions: "1 WhatsApp connection",
    description: "Perfect for individuals starting out — connect one number and explore the full API.",
    features: [
      "1 WhatsApp session",
      "Full REST API access",
      "Real-time webhooks",
      "Text & media messaging",
      "Contact management",
      "Email support"
    ]
  },
  {
    name: "Pro",
    price: "৳399",
    duration: "/2 months",
    sessions: "3 WhatsApp connections",
    popular: true,
    description: "Best for small teams — three numbers, two months, full features.",
    features: [
      "3 WhatsApp sessions",
      "Full REST API access",
      "Real-time webhooks",
      "Group messaging",
      "Polls, stickers, reactions",
      "Priority email support"
    ]
  },
  {
    name: "Annual",
    price: "৳1,000",
    duration: "/year",
    sessions: "3 WhatsApp connections",
    badge: "Best Value",
    description: "Save big with annual billing — 3 connections for a full year at the lowest rate.",
    features: [
      "3 WhatsApp sessions",
      "Full REST API access",
      "Real-time webhooks",
      "Group messaging",
      "Polls, stickers, reactions",
      "Priority email support",
      "Effective ৳84/month"
    ]
  },
  {
    name: "Unlimited",
    price: "৳600",
    duration: "/month",
    sessions: "Unlimited connections",
    highlight: true,
    description: "Power users and agencies — unlimited everything, premium support.",
    features: [
      "Unlimited WhatsApp sessions",
      "Unlimited messages",
      "Full REST API access",
      "Real-time webhooks",
      "Group messaging",
      "Polls, stickers, reactions",
      "MCP server integration",
      "Premium support"
    ]
  }
];

export const faqItems = [
  {
    question: "Can you guarantee a WhatsApp number will never be banned?",
    answer:
      "No responsible provider can guarantee that. Whats Flow is designed around consent, rate controls, queue pacing, and risk visibility to reduce restriction risk as much as possible."
  },
  {
    question: "Do users see that messages are sent through an API?",
    answer:
      "Messages are sent from your connected session. The dashboard focuses on delivery, webhook events, and logs; your customer experience remains inside WhatsApp."
  },
  {
    question: "Can I connect multiple accounts?",
    answer:
      "Yes. Plans are organized by connected sessions, and every session can have its own API key, webhook URL, safety profile, and logs."
  },
  {
    question: "What message types are supported?",
    answer:
      "Text, images, video, audio, documents, contacts, location, stickers, polls, quoted messages, reactions, and presence updates are represented in the product surface."
  }
];

export const docsNav = [
  {
    section: "Quickstart",
    items: ["Overview", "Authentication", "Create a session", "Connect QR", "Typing And Seen"]
  },
  {
    section: "Core APIs",
    items: ["Send text", "Session status", "Contacts", "Webhook setup", "Webhook payload", "Webhook headers"]
  },
  {
    section: "Sessions",
    items: ["Session status"]
  },
  {
    section: "Operations",
    items: ["Retries", "Troubleshooting", "Security notes"]
  }
];

export const endpointRows = [
  { method: "POST", path: "/api/whatsapp/sessions", description: "Create a WhatsApp session and store metadata." },
  { method: "GET", path: "/api/whatsapp/sessions", description: "List sessions for the signed-in workspace." },
  { method: "POST", path: "/api/whatsapp/sessions/{id}/qr", description: "Start or refresh a QR connection flow." },
  { method: "GET", path: "/api/whatsapp/sessions/{id}/status", description: "Fetch live session status and connected number." },
  { method: "GET", path: "/api/status", description: "Fetch public session status with a session API key." },
  { method: "GET", path: "/api/user", description: "Get connected account info for the current session API key." },
  { method: "GET", path: "/api/check-number/{phoneNumber}", description: "Check whether a phone number is registered on WhatsApp." },
  { method: "GET", path: "/api/contacts", description: "List synced contacts for the current session." },
  { method: "PUT", path: "/api/contacts", description: "Create or update a saved contact display name for this session." },
  { method: "GET", path: "/api/contacts/{contactPhoneNumber}", description: "Fetch one contact by phone number, JID, or LID." },
  { method: "GET", path: "/api/contacts/{contactPhoneNumber}/picture", description: "Get the latest available WhatsApp profile picture URL for a contact." },
  { method: "POST", path: "/api/contacts/{contactPhoneNumber}/block", description: "Block a contact from the connected WhatsApp session." },
  { method: "POST", path: "/api/contacts/{contactPhoneNumber}/unblock", description: "Unblock a contact from the connected WhatsApp session." },
  { method: "GET", path: "/api/lid-from-pn/{pn}", description: "Resolve a WhatsApp LID from a known phone number when it is available in synced contacts." },
  { method: "GET", path: "/api/pn-from-lid/{lid}", description: "Resolve a phone number from a known LID when it is available in synced contacts." },
  { method: "POST", path: "/api/whatsapp/sessions/{id}/webhook", description: "Save the inbound webhook URL for one session." },
  { method: "POST", path: "/api/whatsapp/sessions/{id}/api-key", description: "Generate or rotate the session API key used by the public send endpoint." },
  { method: "POST", path: "/api/send-presence-update", description: "Send a WhatsApp presence update such as typing, recording, or paused." },
  { method: "POST", path: "/api/send-typing", description: "Trigger WhatsApp typing animation with a session API key." },
  { method: "POST", path: "/api/send-message", description: "Send text, media, polls, location, contacts, mentions, and view-once messages with a session API key." },
  { method: "POST", path: "/api/send-seen", description: "Mark the latest inbound WhatsApp message as seen with a session API key." },
  { method: "GET", path: "/api/webhooks", description: "Inspect recent webhook delivery attempts and retry outcomes." }
];

export const webhookEvents = [
  "message.received",
  "message.sent"
];

export const recentActivity = [
  { event: "Webhook delivered", detail: "message.received to support endpoint", time: "34s ago", status: "success" },
  { event: "Queue paced", detail: "18 sales follow-ups spread over 4 minutes", time: "3m ago", status: "warning" },
  { event: "Session connected", detail: "Order Updates reconnected from Frankfurt", time: "11m ago", status: "success" },
  { event: "API key copied", detail: "wfk_live_84c2 revealed once by owner", time: "24m ago", status: "neutral" }
];

export const webhookDeliveries = [
  { event: "message.received", endpoint: "/api/whatsapp/support", status: "200 OK", attempts: 1, latency: "186 ms" },
  { event: "message.status", endpoint: "/api/whatsapp/orders", status: "200 OK", attempts: 1, latency: "121 ms" },
  { event: "session.status", endpoint: "/api/whatsapp/sales", status: "Retrying", attempts: 2, latency: "timeout" },
  { event: "message.reaction", endpoint: "/api/whatsapp/support", status: "200 OK", attempts: 1, latency: "174 ms" }
];

export const messageLogs = [
  { direction: "outbound", type: "text", status: "delivered", jid: "8801711111111@s.whatsapp.net", latency: "1.2s" },
  { direction: "inbound", type: "image", status: "received", jid: "8801811111111@s.whatsapp.net", latency: "0.8s" },
  { direction: "outbound", type: "document", status: "read", jid: "8801911111111@s.whatsapp.net", latency: "2.4s" },
  { direction: "outbound", type: "poll", status: "queued", jid: "8801611111111@s.whatsapp.net", latency: "paced" }
];

export const apiKeys = [
  { name: "Production REST key", prefix: "wfk_live_84c2", scope: "messages:write, sessions:read", lastUsed: "2m ago" },
  { name: "Webhook verifier", prefix: "wfk_live_55df", scope: "webhooks:replay", lastUsed: "1h ago" },
  { name: "Development key", prefix: "wfk_test_102a", scope: "sandbox:*", lastUsed: "Yesterday" }
];

export const settingsSections = [
  { icon: LockKeyhole, title: "Security", body: "Passwordless login, OAuth providers, 2FA readiness, and session audit controls." },
  { icon: Radar, title: "Safety defaults", body: "Default queue speed, endpoint caps, risk labels, and consent-only outbound policy." },
  { icon: LifeBuoy, title: "Support routing", body: "Billing contacts, incident email, and customer escalation preferences." }
];

export const commandItems = [
  { icon: Send, label: "Send test message", href: "/app/sessions/s_001" },
  { icon: KeyRound, label: "Open API keys", href: "/app/api-keys" },
  { icon: Webhook, label: "Inspect webhooks", href: "/app/webhooks" },
  { icon: ServerCog, label: "Create session", href: "/app/sessions/new" },
  { icon: Workflow, label: "Usage analytics", href: "/app/usage" },
  { icon: Bot, label: "Safety settings", href: "/app/settings" },
  { icon: PlugZap, label: "API documentation", href: "/docs" },
  { icon: Zap, label: "Upgrade plan", href: "/app/billing" }
] as const;

export const codeSamples = {
  ts: `const response = await fetch("https://your-domain.com/api/send-message", {
  method: "POST",
  headers: {
    Authorization: "Bearer wfk_live_xxx",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    to: "8801712345678",
    text: "Your order is ready for delivery."
  })
});

const data = await response.json();
console.log(data);`,
  bash: `curl -X POST https://your-domain.com/api/send-message \\
  -H "Authorization: Bearer wfk_live_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "8801712345678",
    "text": "Your order is ready for delivery."
  }'`,
  python: `import requests

response = requests.post(
    "https://your-domain.com/api/send-message",
    headers={
        "Authorization": "Bearer wfk_live_xxx",
        "Content-Type": "application/json"
    },
    json={
        "to": "8801712345678",
        "text": "Your order is ready for delivery."
    },
    timeout=30
)

print(response.json())`,
  php: `<?php
$response = (new GuzzleHttp\\Client())->post(
  'https://your-domain.com/api/send-message',
  [
    'headers' => [
      'Authorization' => 'Bearer wfk_live_xxx',
      'Content-Type' => 'application/json',
    ],
    'json' => [
      'to' => '8801712345678',
      'text' => 'Your order is ready for delivery.',
    ],
  ]
);

echo $response->getBody();`
};

export const webhookPayload = `{
  "event": "message.received",
  "timestamp": 1777975200000,
  "data": {
    "sessionId": "session_uuid",
    "sessionName": "Support Line",
    "direction": "inbound",
    "remoteJid": "8801712345678@s.whatsapp.net",
    "fromMe": false,
    "pushName": "Customer Name",
    "message": {
      "id": "BAE5F1A2E7",
      "from": "8801712345678",
      "to": "8801812345678",
      "type": "text",
      "text": "Do you deliver today?",
      "timestamp": 1777975200000,
      "raw": {
        "conversation": "Do you deliver today?"
      }
    }
  }
}`;
