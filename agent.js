// Connects to local Ollama API (default port 11434)
async function evaluateResource(resource) {
  const prompt = `
    You are an automated IT cost-saving agent.
    Analyze this resource: Employee ${resource.employee_name} has a ${resource.resource_type} called "${resource.resource_name}" costing $${resource.monthly_cost}/mo.
    They have not used it in ${resource.days_since_last_login} days.
    If it has been unused for over 30 days, recommend "TERMINATE". Otherwise, recommend "KEEP".
    Only respond with one word: TERMINATE or KEEP.
    `;

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3", // Make sure you have this pulled in Ollama
        prompt: prompt,
        stream: false,
      }),
    });

    const data = await response.json();
    return data.response.trim();
  } catch (error) {
    console.error("Ollama connection failed:", error);
    return "ERROR";
  }
}

module.exports = { evaluateResource };
