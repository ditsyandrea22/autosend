const { ethers } = require("ethers");
const { runRescue } = require("./rescueEngine");
const { RPC_URL } = require("../config/env");

// Create a provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function startBlockWatcher() {
  provider.on("block", async (blockNumber) => {
    console.log("New block:", blockNumber);
    await runRescue(blockNumber);
  });
}

module.exports = { startBlockWatcher };