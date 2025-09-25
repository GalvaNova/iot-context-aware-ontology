const fs = require("fs");
const path = require("path");

function loadQuery(filePath, params = {}) {
  let query = fs.readFileSync(path.join(__dirname, "..", filePath), "utf8");

  // Replace semua placeholder {key} dengan value
  for (const [key, value] of Object.entries(params)) {
    const regex = new RegExp(`\\{${key}\\}`, "g"); // escape {}
    query = query.replace(regex, value);
  }

  return query;
}

module.exports = loadQuery;
