use ethers::contract::abigen;

abigen!(
    UniswapV3Slot0,
    r#"[ "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)" ]"#
);

pub use UniswapV3Slot0;
