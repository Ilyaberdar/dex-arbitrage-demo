use ethers::contract::abigen;

abigen!(
    UniswapV2Reserves,
    r#"[ function getReserves() view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) ]"#
);

pub use UniswapV2Reserves;
