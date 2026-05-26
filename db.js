const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./ledger.sqlite");

db.serialize(() => {
  // Create the table
  db.run(`CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_name TEXT,
        resource_type TEXT,
        resource_name TEXT,
        monthly_cost INTEGER,
        days_since_last_login INTEGER,
        status TEXT
    )`);

  // Insert mock data if the table is empty
  db.get("SELECT COUNT(*) AS count FROM resources", (err, row) => {
    if (row.count === 0) {
      const insert = db.prepare(
        `INSERT INTO resources (employee_name, resource_type, resource_name, monthly_cost, days_since_last_login, status) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      insert.run(
        "Alice Smith",
        "SaaS",
        "Adobe Creative Cloud",
        80,
        45,
        "Active",
      );
      insert.run("Bob Jones", "Server", "AWS EC2 t3.xlarge", 150, 60, "Active");
      insert.run("Charlie Davis", "SaaS", "Figma Pro", 45, 2, "Active");
      insert.finalize();
      console.log("Mock data injected into the ledger.");
    }
  });
});

module.exports = db;
