const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./ledger.sqlite");

db.serialize(() => {
  // Upgraded schema with installation dates and security flags
  db.run(`CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_name TEXT,
        resource_type TEXT,
        resource_name TEXT,
        monthly_cost INTEGER,
        install_date TEXT,
        days_since_last_login INTEGER,
        is_malicious BOOLEAN,
        needs_update BOOLEAN,
        status TEXT
    )`);

  // Inject realistic enterprise data
  db.get("SELECT COUNT(*) AS count FROM resources", (err, row) => {
    if (row.count === 0) {
      const insert = db.prepare(
        `INSERT INTO resources (employee_name, resource_type, resource_name, monthly_cost, install_date, days_since_last_login, is_malicious, needs_update, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      // 1. Unused Expense (Should Terminate)
      insert.run(
        "Alice Smith",
        "SaaS",
        "Figma Enterprise",
        120,
        "2025-11-01",
        45,
        false,
        false,
        "Active",
      );
      // 2. Active & Healthy (Should Keep)
      insert.run(
        "Bob Jones",
        "Server",
        "AWS EC2 Production",
        450,
        "2024-03-15",
        1,
        false,
        false,
        "Active",
      );
      // 3. Security Threat (Should Quarantine)
      insert.run(
        "Charlie Davis",
        "Software",
        "FreeVPN_Crack.exe",
        0,
        "2026-05-20",
        2,
        true,
        false,
        "Active",
      );
      // 4. Malfunctioning/Outdated (Should Update)
      insert.run(
        "Diana Prince",
        "SaaS",
        "GitLab Runner (v14.1)",
        85,
        "2023-08-10",
        5,
        false,
        true,
        "Active",
      );
      // 5. Zombie Cloud Sub (Should Terminate)
      insert.run(
        "Evan Wright",
        "Cloud",
        "Datadog Test Environment",
        850,
        "2026-01-12",
        60,
        false,
        false,
        "Active",
      );

      insert.finalize();
      console.log("Upgraded enterprise data injected into the ledger.");
    }
  });
});

module.exports = db;
