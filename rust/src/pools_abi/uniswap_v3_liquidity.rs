use ethers::contract::abigen;

abigen!(
    UniswapV3Liquidity,
    r#"[ "function liquidity() view returns (uint128)" ]"#
);

pub use UniswapV3Liquidity;
