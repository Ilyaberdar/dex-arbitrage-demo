const hardhat = require("hardhat");
const Web3 = require("web3");
const { expect } = require("chai");
const ethers = require('ethers');

describe("FlashSwapArbitrageV2", function () {
  let contract;
  let owner;
  let token0;
  let token1;
  let pool0, pool1, pool2;

  beforeEach(async () => {
    [owner] = await hardhat.ethers.getSigners();

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/2S3IoADMLVdnijcimHMG9bzqpGhQ-Hgn',
            blockNumber: 19200000,
          },
        },
      ],
    });

    const FlashSwapArbitrageV2 = await hardhat.ethers.getContractFactory("FlashSwapArbitrageV2");
    contract = await FlashSwapArbitrageV2.deploy();
    await contract.waitForDeployment();

    token0 = Web3.utils.toChecksumAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");
    token1 = Web3.utils.toChecksumAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");

    pool0 = Web3.utils.toChecksumAddress("0x57b85fef094e10b5eecdf350af688299e9553378");
    pool1 = Web3.utils.toChecksumAddress("0xF64Dfe17C8b87F012FCf50FbDA1D62bfA148366a");
    pool2 = Web3.utils.toChecksumAddress("0xF64Dfe17C8b87F012FCf50FbDA1D62bfA148366a");
    console.log(contract.target);
  });

  it("Should execute flash swap and return profit", async () => {
    const amountIn = hardhat.ethers.parseUnits("100000", 6);
    try {
      const tx = await contract.initiateFlashSwap(pool0, pool1, pool2, token0, token1, amountIn
      );

      await tx.wait();
    } catch (err) {
      console.error("REVERT ERROR:", err);
    }
  });
});
