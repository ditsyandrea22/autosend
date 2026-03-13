/**
 * Start Script
 * Convenience script to start the rescue bot
 */

const { start } = require("../src/index");

console.log("Starting Production Rescue Bot...\n");

start().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
