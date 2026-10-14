require("dotenv").config();

const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const API_URL = "https://api.abliteration.ai/v1/chat/completions";
const MODEL = "abliterated-model";

const apiKey = process.env.ABLITERATION_API_KEY;

if (!apiKey) {
  console.error("❌ ABLITERATION_API_KEY is missing from .env");
  process.exit(1);
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/api/status", (req, res) => {
  res.json({
    server: "online",
    apiConfigured: true,
    model: MODEL
  });
});

function extractAnswer(data) {
  const choice = data?.choices?.[0];

  const content =
    choice?.message?.content ??
    choice?.delta?.content ??
    data?.content ??
    data?.answer ??
    data?.response ??
    data?.text;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === "string") return part;

      return (
        part?.text ||
        part?.content ||
        ""
      );
    }).join("").trim();
  }

  // NEVER return message.reasoning.
  // The provider may expose internal thinking there.
  return "";
}

app.post("/api/chat", async (req, res) => {
  const messages = Array.isArray(req.body?.messages)
    ? req.body.messages
    : [];

  if (!messages.length) {
    return res.status(400).json({
      error: "No messages supplied."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 90000);

  try {
    console.log(
      "💬 User:",
      messages[messages.length - 1]?.content
    );

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },

      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are Nova AI. Answer the user directly and briefly. Never show, describe, or output your reasoning or thinking process. Only provide the final answer. For casual questions, use one short sentence. For simple questions, keep the answer concise."
          },
          ...messages
        ],

        temperature: 0.3,
        max_tokens:
          messages.some(m =>
            typeof m.content === "string" &&
            /code|script|javascript|userscript|greasemonkey|tampermonkey|greasyfork|html|css|python|program|function/i.test(m.content)
          )
            ? 1800
            : 80,
        reasoning_effort: "none",

        stream: false
      }),

      signal: controller.signal
    });

    const raw = await response.text();

    console.log(
      "📡 API status:",
      response.status
    );

    if (!response.ok) {
      console.error(
        "❌ API:",
        raw
      );

      return res.status(response.status).json({
        error:
          `AI API error ${response.status}: ` +
          raw.slice(0, 500)
      });
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      console.error(
        "❌ API returned invalid JSON:",
        raw
      );

      return res.status(502).json({
        error: "The AI returned invalid data."
      });
    }

    const answer = extractAnswer(data);

    console.log(
      "🤖 Answer length:",
      answer.length
    );

    if (!answer.trim()) {
      console.error(
        "❌ Provider returned no answer:",
        JSON.stringify(data)
      );

      return res.status(502).json({
        error: "The AI provider returned an empty answer."
      });
    }

    return res.json({
      answer
    });

  } catch (error) {

    console.error(
      "❌ Server error:",
      error.message
    );

    return res.status(
      error.name === "AbortError"
        ? 504
        : 500
    ).json({
      error:
        error.name === "AbortError"
          ? "The AI took too long to respond."
          : error.message
    });

  } finally {
    clearTimeout(timeout);
  }
});

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🚀 Nova AI running at http://localhost:${PORT}`
    );

    console.log(
      `Model: ${MODEL}`
    );
  }
);
