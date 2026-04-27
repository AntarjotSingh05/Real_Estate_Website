const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

async function generateLeadResponse(lead) {
  const name = lead?.name ?? "";
  const city = lead?.city ?? "";
  const budget = lead?.budget ?? "";

  if (!OPENAI_API_KEY) {
    return {
      response:
        "Thanks for reaching out! Would you like to schedule a property viewing this week?",
      usedFallback: true
    };
  }

  const prompt = `You are a friendly real estate assistant.

Lead details:
Name: ${name}
City: ${city}
Budget: ${budget}

Write a short message asking if they want to schedule a property viewing.
Keep under 25 words.`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      temperature: 0.7,
      max_output_tokens: 80
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const outputText =
    data.output_text ||
    (Array.isArray(data.output)
      ? data.output
          .flatMap((o) => o.content || [])
          .map((c) => c.text)
          .filter(Boolean)
          .join("\n")
      : "");

  return { response: (outputText || "").trim(), usedFallback: false };
}

module.exports = { generateLeadResponse };

