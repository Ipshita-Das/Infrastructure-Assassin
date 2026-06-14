// agent.js

// 🛠️ DEVELOPMENT SWITCH
// true  -> Bypasses AI entirely (Instant mock response for UI testing)
// false -> Connects to local Ollama Llama 3.2 (No limits, no internet required!)
const DEV_SANDBOX_MODE = false;

async function evaluateResource(resource) {
  // 1. Analyze the resource status locally
  const isIdle = resource.days_since_last_login >= 30 ? "YES" : "NO";
  const isMalicious = resource.is_malicious ? "YES" : "NO";
  const needsUpdate = resource.needs_update ? "YES" : "NO";

  // 2. THE HACKATHON SAFETY NET: Calculate the correct answer locally
  let guaranteedAnswer = "KEEP";
  if (isMalicious === "YES") guaranteedAnswer = "QUARANTINE";
  else if (isIdle === "YES") guaranteedAnswer = "TERMINATE";
  else if (needsUpdate === "YES") guaranteedAnswer = "UPDATE";

  // ⚡ SANDBOX SHORT-CIRCUIT: Bypasses AI requests if sandbox mode is active
  if (DEV_SANDBOX_MODE) {
    return guaranteedAnswer;
  }

  const prompt = `
    You are a strict enterprise IT security agent. You must respond with EXACTLY ONE WORD.
    Malicious Threat: ${isMalicious}
    Idle Over 30 Days: ${isIdle}
    Needs Critical Update: ${needsUpdate}

    RULES:
    1. If Malicious Threat is YES -> output QUARANTINE
    2. If Idle Over 30 Days is YES -> output TERMINATE
    3. If Needs Critical Update is YES -> output UPDATE
    4. Otherwise -> output KEEP
    `;

  try {
    // ⚡ THE LOCAL OLLAMA PIPELINE ⚡
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt: prompt,
        stream: false,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.log(
        `[OLLAMA ERROR] Local AI failed for ${resource.resource_name}. Using local orchestrator.`,
      );
      return guaranteedAnswer;
    }

    const rawResponse = data.response.toUpperCase();

    // Contextual keyword matching
    if (rawResponse.includes("QUARANTINE")) return "QUARANTINE";
    if (rawResponse.includes("TERMINATE")) return "TERMINATE";
    if (rawResponse.includes("UPDATE")) return "UPDATE";

    // 🛠️ CRITICAL FIX: Fall back to the guaranteed answer instead of forcing "KEEP"
    return guaranteedAnswer;
  } catch (error) {
    console.log(
      `[OLLAMA OFFLINE] Connection failed. Make sure the Ollama app is running!`,
    );
    return guaranteedAnswer;
  }
}

// 🛠️ THE MISSING LINK: This tells Node to share the function with server.js!
module.exports = { evaluateResource };
