require("dotenv").config();

const { RescueOrchestrator } = require("./core/rescue-orchestrator");
const { RPC_URL, PRIVATE_KEY, TO_ADDRESS } = require("./config/env");

/**
 * MEV-Grade Rescue Bot
 * 
 * A comprehensive wallet rescue system that:
 * - Monitors mempool for drainer transactions
 * - Uses AI-based drainer detection
 * - Executes multi-asset rescue (ETH, ERC20, NFT)
 * - Sends bundles via Flashbots and multiple builders
 * - Uses competitive gas strategies
 * 
 * WARNING: Use only for protecting wallets you own
 */

async function start() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🚀 MEV-GRADE RESCUE BOT v1.0.0                       ║
║                                                              ║
║  Protecting wallet from drainer attacks using:              ║
║  • AI Drainer Classifier                                     ║
║  • Transaction Risk Analyzer                                  ║
║  • Multi-Builder Bundle Broadcast                             ║
║  • Gas Escalator Strategy                                     ║
║  • Parallel Block Targeting                                   ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Validate required configuration
  if (!RPC_URL || !PRIVATE_KEY || !TO_ADDRESS) {
    console.error("❌ Missing required configuration:");
    console.error("   - RPC_URL");
    console.error("   - PRIVATE_KEY");
    console.error("   - TO_ADDRESS");
    console.error("\nPlease check your .env file");
    process.exit(1);
  }

  // Create orchestrator
  const orchestrator = new RescueOrchestrator({
    rpcUrl: RPC_URL,
    privateKey: PRIVATE_KEY,
    safeAddress: TO_ADDRESS,
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down...");
    orchestrator.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Shutting down...");
    orchestrator.stop();
    process.exit(0);
  });

  try {
    // Start the orchestrator
    await orchestrator.start();
    
    // Log initial status
    setTimeout(() => {
      const status = orchestrator.getStatus();
      console.log("\n📊 Initial Status:");
      console.log(`   Wallet: ${status.wallet}`);
      console.log(`   Safe: ${status.safeAddress}`);
      console.log(`   Mempool Monitoring: ${status.mempoolStats.isMonitoring ? "✓ Active" : "✗ Inactive"}`);
    }, 5000);

    // Periodic status logging
    setInterval(() => {
      const status = orchestrator.getStatus();
      if (status.isRunning) {
        console.log(`[Status] Block monitoring active | Latency: ${status.latencyReport.healthScore}%`);
      }
    }, 60000);

  } catch (error) {
    console.error("❌ Failed to start:", error.message);
    process.exit(1);
  }
}

start();
