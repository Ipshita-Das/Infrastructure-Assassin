const express = require("express");
const cors = require("cors");
const db = require("./db");
const crypto = require("crypto");

// 🛠️ THE FIX: Imported globally at the top so Node always knows where it is!
const { evaluateResource } = require("./agent");

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// --- MOCK IDENTITY PROVIDER ---
const corporateDirectory = [
  {
    email: "rachel.green@gmail.com",
    password: "admin",
    name: "Rachel Green",
    role: "IT-Director",
  },
  {
    email: "ross.geller@gmail.com",
    password: "dev",
    name: "Ross Geller",
    role: "Junior-Developer",
  },
];

const activeSessions = {};
const pendingApprovals = []; // Rachel's Inbox

// --- LOGIN ENDPOINT ---
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = corporateDirectory.find(
    (u) => u.email === email && u.password === password,
  );

  if (!user)
    return res
      .status(401)
      .json({ success: false, message: "Invalid corporate credentials." });

  const token = crypto.randomBytes(16).toString("hex");
  activeSessions[token] = user;

  console.log(
    `[SSO LOGIN] ${user.name} (${user.role}) authenticated successfully.`,
  );
  res.json({
    success: true,
    token: token,
    user: { name: user.name, role: user.role },
  });
});

// --- SECURITY MIDDLEWARE ---
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ error: "No authorization token provided." });

  const token = authHeader.split(" ")[1];
  const user = activeSessions[token];

  if (!user)
    return res.status(401).json({ error: "Session expired or invalid." });

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "IT-Director")
    return res.status(403).json({ error: "Admin clearance required." });
  next();
}

// --- SECURED INFRASTRUCTURE PIPELINES ---
let cachedAuditResults = null;
let lastAuditTime = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.get("/api/audit", authenticateUser, (req, res) => {
  if (cachedAuditResults && Date.now() - lastAuditTime < 300000) {
    console.log(
      `[CACHE HIT] ⚡ Serving dashboard instantly for ${req.user.name}.`,
    );
    return res.json(cachedAuditResults);
  }

  db.all(
    "SELECT * FROM resources WHERE status = 'Active'",
    async (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });

      const auditedResources = [];

      console.log(
        `\n⚙️ Starting Local Llama Audit for ${rows.length} resources...`,
      );

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const action = await evaluateResource(row);
        auditedResources.push({ ...row, recommended_action: action });
        // Keep a small delay so CPU doesn't spike at 100%
        if (i < rows.length - 1) await sleep(500);
      }

      console.log(`✅ Local Audit Complete! Saving to cache.`);
      cachedAuditResults = auditedResources;
      lastAuditTime = Date.now();

      res.json(auditedResources);
    },
  );
});

// --- UNIFIED ACTION ROUTE ---
app.post("/api/action", authenticateUser, (req, res) => {
  const { actionType, resource_name, details } = req.body;
  const timeStamp = new Date().toLocaleString();

  if (req.user.role === "Junior-Developer") {
    const requestItem = {
      id: crypto.randomUUID(),
      requester: req.user.name,
      action: actionType,
      resource: resource_name,
      details: details || "Immediate",
      time: timeStamp,
    };
    pendingApprovals.push(requestItem);

    console.log(
      `[APPROVAL REQUIRED] ${req.user.name} requested to ${actionType} ${resource_name}.`,
    );
    return res.json({
      success: true,
      pending: true,
      message: "Action requires IT-Director approval. Request sent.",
    });
  }

  console.log(
    `[EXECUTED] ${req.user.name} performed ${actionType} on ${resource_name}`,
  );
  res.json({
    success: true,
    pending: false,
    message: `${actionType} protocol executed.`,
  });
});

// --- ADMIN INBOX ROUTES ---
app.get("/api/approvals", authenticateUser, (req, res) => {
  if (req.user.role !== "IT-Director") return res.json([]);
  res.json(pendingApprovals);
});

app.post(
  "/api/approvals/resolve",
  authenticateUser,
  requireAdmin,
  (req, res) => {
    const { id, decision } = req.body;
    const requestIndex = pendingApprovals.findIndex((r) => r.id === id);
    if (requestIndex === -1)
      return res.status(404).json({ error: "Request no longer exists." });

    const request = pendingApprovals[requestIndex];
    pendingApprovals.splice(requestIndex, 1);

    if (decision === "Approve") {
      console.log(
        `[APPROVED] Rachel Green authorized Ross's request to ${request.action} ${request.resource}.`,
      );
      res.json({
        success: true,
        message: `Approved ${request.action} for ${request.resource}`,
      });
    } else {
      console.log(
        `[REJECTED] Rachel Green rejected Ross's request for ${request.resource}.`,
      );
      res.json({
        success: true,
        message: `Rejected ${request.requester}'s request.`,
      });
    }
  },
);

// --- CONVERSATIONAL AI ENDPOINT (Ollama + NLP Fallback) ---
// --- CONVERSATIONAL AI ENDPOINT (Ollama + NLP Fallback) ---
let lastResourceContext = null;
let chatHistory = []; // 🧠 NEW: AI Memory Array

app.post("/api/chat", authenticateUser, (req, res) => {
  const userMessage = req.body.message;

  // 1. Save the user's message to the server's memory
  chatHistory.push(`User: ${userMessage}`);
  // Keep only the last 6 messages so the context doesn't get too heavy
  if (chatHistory.length > 6) chatHistory.shift();

  db.all("SELECT * FROM resources", async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const dbContext = JSON.stringify(rows);
    const historyContext = chatHistory.join("\n");

    // 2. Inject the memory into the prompt!
    const prompt = `You are "Infrastructure Assassin", an enterprise IT security AI.
        You are currently talking to ${req.user.name}, who is logged in as an ${req.user.role}.

        Current Infrastructure Data: ${dbContext}

        Recent Conversation Context:
        ${historyContext}

        CRITICAL RULES FOR YOUR RESPONSE:
        1. YOU CANNOT EXECUTE ACTIONS. Never say "I have removed", "I deleted", or "I quarantined".
        2. You are an ADVISOR. You must tell the user what *they* should do.
        3. Tell the user to use the action buttons on their dashboard to execute protocols.
        4. If the user is a Junior-Developer, remind them that their actions will go to Rachel's inbox for approval.

        Respond to the User's last message: "${userMessage}"`;
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

      if (!response.ok || data.error) {
        throw new Error("Ollama endpoint failed.");
      }

      const finalReply = data.response.trim();

      // 3. Save the AI's response to memory so it remembers its own answers
      chatHistory.push(`Assassin AI: ${finalReply}`);

      res.json({ reply: finalReply });
    } catch (error) {
      // 🛡️ TIER 2 FALLBACK: Contextual NLP Matrix
      console.error(
        "[OLLAMA UNAVAILABLE]: Routing to Tier-2 Local NLP Engine.",
      );

      const msg = userMessage.toLowerCase();

      if (msg.includes("figma")) lastResourceContext = "figma";
      else if (msg.includes("vpn") || msg.includes("freevpn"))
        lastResourceContext = "vpn";
      else if (msg.includes("datadog")) lastResourceContext = "datadog";
      else if (msg.includes("gitlab")) lastResourceContext = "gitlab";
      else if (msg.includes("aws") || msg.includes("ec2"))
        lastResourceContext = "aws";

      let localReply =
        "Neural Link offline. Operating via local metrics: You have ₹970 in potential savings identified.";

      if (lastResourceContext === "figma") {
        if (
          msg.includes("why") ||
          msg.includes("reason") ||
          msg.includes("cause")
        ) {
          localReply =
            "It is flagged because corporate directory audits show zero user access logs over the last 45 days, leading to unutilized seat waste.";
        } else if (
          msg.includes("do") ||
          msg.includes("solution") ||
          msg.includes("fix") ||
          msg.includes("action")
        ) {
          localReply =
            "Recommended Solution: Run an administrative deprovisioning script on the Figma enterprise dashboard to terminate the 5 idle licenses and claw back ₹120/month.";
        } else {
          localReply =
            "Figma Enterprise has been flagged to TERMINATE. It costs ₹120/month but hasn't been accessed in 45 days.";
        }
      } else if (lastResourceContext === "vpn") {
        if (
          msg.includes("why") ||
          msg.includes("malicious") ||
          msg.includes("danger")
        ) {
          localReply =
            "The cryptographic hash of FreeVPN_Crack.exe matches known malicious signature patterns associated with standard keyloggers and credential-harvesting Trojans.";
        } else if (
          msg.includes("do") ||
          msg.includes("solution") ||
          msg.includes("fix") ||
          msg.includes("action")
        ) {
          localReply =
            "Immediate Action Plan: Trigger an automated network isolation protocol on that specific workstation node, terminate the process tree, and purge the binary from local storage.";
        } else {
          localReply =
            "CRITICAL ALERT: FreeVPN_Crack.exe has been flagged as malicious. Immediate QUARANTINE recommended.";
        }
      } else if (lastResourceContext === "datadog") {
        if (msg.includes("why") || msg.includes("reason")) {
          localReply =
            "It is retained because telemetry metrics show constant developer activity, API testing, and live infrastructure logging workloads.";
        } else if (
          msg.includes("do") ||
          msg.includes("solution") ||
          msg.includes("optimize")
        ) {
          localReply =
            "Management Path: No immediate actions required to change status. Maintain execution but keep an eye on storage retention policies to avoid cost overruns.";
        } else {
          localReply =
            "Datadog Test Environment is secure. It is costing ₹850/month but is actively used. Recommendation: KEEP.";
        }
      } else if (lastResourceContext === "gitlab") {
        if (msg.includes("why") || msg.includes("vulnerab")) {
          localReply =
            "Build engine v14.1 contains unpatched remote code execution (RCE) flaws that leave build deployment variables vulnerable to external exposure.";
        } else if (
          msg.includes("do") ||
          msg.includes("solution") ||
          msg.includes("fix") ||
          msg.includes("action")
        ) {
          localReply =
            "Technical Remediation: Pull the latest stable container images from the official repository and run an infrastructure update to transition runners to v16+ securely.";
        } else {
          localReply =
            "GitLab Runner (v14.1) requires a critical security patch. Recommendation: UPDATE.";
        }
      } else if (lastResourceContext === "aws") {
        if (msg.includes("why") || msg.includes("status")) {
          localReply =
            "Production instance metrics indicate operational health parameters and active connections are within safe enterprise baselines.";
        } else if (msg.includes("do") || msg.includes("solution")) {
          localReply =
            "Action: Keep live. Ensure continuous integration snapshots and automated cluster backups remain valid and scheduled.";
        } else {
          localReply =
            "AWS EC2 Production is secure and active. Recommendation: KEEP.";
        }
      }

      // 4. Save the fallback's response to memory as well!
      chatHistory.push(`Assassin AI: ${localReply}`);
      return res.json({ reply: localReply });
    }
  });
});

// --- ENGINE STARTER ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n=============================================`);
  console.log(`🔥 INFRASTRUCTURE ASSASSIN BACKEND IS LIVE!`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`=============================================\n`);
});
