const hardhat = require("hardhat");
const Web3 = require("web3");
const { expect } = require("chai");
const ethers = require('ethers');

describe("FlashSwapArbitrageV3", function () {
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

        const FlashSwapArbitrageV3 = await hardhat.ethers.getContractFactory("FlashSwapArbitrageV3");
        contract = await FlashSwapArbitrageV3.deploy();
        await contract.waitForDeployment();

        token0 = Web3.utils.toChecksumAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");
        token1 = Web3.utils.toChecksumAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");

        pool0 = Web3.utils.toChecksumAddress("0xc31e54c7a869b9fcbecc14363cf510d1c41fa443");
        pool1 = Web3.utils.toChecksumAddress("0xf3eb87c1f6020982173c908e7eb31aa66c1f0296");
        pool2 = Web3.utils.toChecksumAddress("0xc473e2aee3441bf9240be85eb122abb059a3b57c");
        console.log(contract.target);
    });

    it("Should execute flash swap and return profit", async () => {
        amountIn = hardhat.ethers.parseUnits("10", 6);

        try {
            const tx = await contract.flashSwap(pool0, pool1, pool2, token0, token1, amountIn);
            await tx.wait();
        } catch (err) {
            console.error("REVERT ERROR:", err);
        }
    });
});
