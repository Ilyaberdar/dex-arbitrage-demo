require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: 'https://arb-mainnet.g.alchemy.com/v2/2S3IoADMLVdnijcimHMG9bzqpGhQ-Hgn',
        blockNumber: 19200000,
      },
    },
  },
};
