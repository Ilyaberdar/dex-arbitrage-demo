const UNISWAP_V2_POOL_ABI = [
    {
      "constant": true,
      "inputs": [],
      "name": "getReserves",
      "outputs": [
        { "name": "_reserve0", "type": "uint112" },
        { "name": "_reserve1", "type": "uint112" },
        { "name": "_blockTimestampLast", "type": "uint32" }
      ],
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "token0",
      "outputs": [
        { "name": "", "type": "address" }
      ],
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "token1",
      "outputs": [
        { "name": "", "type": "address" }
      ],
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "totalSupply",
      "outputs": [
        { "name": "", "type": "uint256" }
      ],
      "type": "function"
    },
    {
      "constant": true,
      "inputs": [],
      "name": "factory",
      "outputs": [
        { "name": "", "type": "address" }
      ],
      "type": "function"
    }
  ];
  
export { UNISWAP_V2_POOL_ABI };
  