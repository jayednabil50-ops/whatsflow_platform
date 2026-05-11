"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Check } from "lucide-react";

type Lang = "PHP" | "JS" | "Python" | "C#" | "Java";

const CODE: Record<Lang, string> = {
  PHP: `<?php

$curl = curl_init();
curl_setopt_array($curl, [
  CURLOPT_URL => "https://api.whatsflow.dev/api/send-message",
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer YOUR_API_KEY",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "to"   => "8801234567890",
    "text" => "Hello from WhatsFlow!",
  ]),
]);

$response = curl_exec($curl);
curl_close($curl);

echo $response;`,

  JS: `const response = await fetch(
  "https://api.whatsflow.dev/api/send-message",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer YOUR_API_KEY",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to:   "8801234567890",
      text: "Hello from WhatsFlow!",
    }),
  }
);

const data = await response.json();
console.log(data);`,

  Python: `import requests

response = requests.post(
    "https://api.whatsflow.dev/api/send-message",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json",
    },
    json={
        "to":   "8801234567890",
        "text": "Hello from WhatsFlow!",
    },
)

print(response.json())`,

  "C#": `using System.Net.Http;
using System.Net.Http.Json;

var client = new HttpClient();
client.DefaultRequestHeaders.Authorization =
    new System.Net.Http.Headers
        .AuthenticationHeaderValue("Bearer", "YOUR_API_KEY");

var response = await client.PostAsJsonAsync(
    "https://api.whatsflow.dev/api/send-message",
    new { to = "8801234567890", text = "Hello from WhatsFlow!" }
);

var result = await response.Content.ReadAsStringAsync();
Console.WriteLine(result);`,

  Java: `import java.net.URI;
import java.net.http.*;

var client  = HttpClient.newHttpClient();
var payload = """
    {"to":"8801234567890","text":"Hello from WhatsFlow!"}
    """;

var request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.whatsflow.dev/api/send-message"))
    .header("Authorization", "Bearer YOUR_API_KEY")
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(payload))
    .build();

var response = client.send(request,
    HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
};

const LANGS: Lang[] = ["PHP", "JS", "Python", "C#", "Java"];

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/50 transition hover:border-white/[0.15] hover:text-white/80"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-400" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> Copy
        </>
      )}
    </button>
  );
}

export function CodeSection() {
  const [lang, setLang] = useState<Lang>("JS");

  return (
    <section className="border-y border-white/[0.05] bg-white/[0.01]" id="integration">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 py-24">
        {/* Heading */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-white">
            WhatsApp Integration Made Effortless
          </h2>
          <p className="mt-3 text-white/45 max-w-xl mx-auto leading-7">
            Send messages with just 3 lines of code. Choose your language and start integrating
            today.
          </p>
        </div>

        {/* Code block */}
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D1117] shadow-[0_32px_80px_rgba(0,0,0,0.5)]">
          {/* Title bar */}
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#161B22] px-5 py-3">
            {/* Traffic lights */}
            <div className="flex items-center gap-4">
              <div className="flex gap-1.5" aria-hidden>
                <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
                <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
                <span className="h-3 w-3 rounded-full bg-[#28C840]" />
              </div>
              <span className="text-xs text-white/30 font-mono">send-message.{lang === "JS" ? "js" : lang === "PHP" ? "php" : lang === "Python" ? "py" : lang === "C#" ? "cs" : "java"}</span>
            </div>

            {/* Language tabs */}
            <div className="flex items-center gap-1">
              {LANGS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    lang === l
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "text-white/35 hover:text-white/60"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <CopyBtn value={CODE[lang]} />
          </div>

          {/* Code */}
          <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-[1.7] text-emerald-50/90 min-h-[280px]">
            <code>{CODE[lang]}</code>
          </pre>
        </div>

        {/* CTA */}
        <div className="mt-10 flex justify-center">
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-7 py-3.5 text-sm font-semibold text-black transition-all duration-300 shadow-[0_0_32px_rgba(52,211,153,0.25)] hover:shadow-[0_0_48px_rgba(52,211,153,0.4)]"
          >
            Get Started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
