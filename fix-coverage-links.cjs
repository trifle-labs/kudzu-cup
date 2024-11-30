const fs = require("fs");
const path = require("path");

// Fix the links in the coverage report
function fixCoverageLinks() {
  // Read the overview file
  const overviewPath = path.join("docs", "contracts", "index.html");

  if (!fs.existsSync(overviewPath)) {
    console.error(
      "Coverage overview file not found. Run coverage report first."
    );
    return;
  }

  let html = fs.readFileSync(overviewPath, "utf8");

  // Fix contract links by adding /contracts/ prefix
  html = html.replace(
    /<a href="([^"]+\.sol\.html)">/g,
    '<a href="/contracts/$1">'
  );

  // Write the fixed file back
  fs.writeFileSync(overviewPath, html);

  console.log("Coverage report links fixed successfully!");
}

// Run the fix
fixCoverageLinks();
