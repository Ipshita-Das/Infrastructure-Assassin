const express = require("express");
const cors = require("cors");
const db = require("./db");
const { evaluateResource } = require("./agent");

const app = express();
app.use(cors());
app.use(express.static("public")); // Serves the dashboard
app.use(express.json());

// API route to get all resources and the Agent's recommendation
app.get("/api/audit", (req, res) => {
  db.all(
    "SELECT * FROM resources WHERE status = 'Active'",
    async (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const auditedResources = [];

      // Feed each resource to the local LLM
      for (const row of rows) {
        const action = await evaluateResource(row);
        auditedResources.push({ ...row, recommended_action: action });
      }

      res.json(auditedResources);
    },
  );
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`[ORCHESTRATOR] System online at http://localhost:${PORT}`);
});
