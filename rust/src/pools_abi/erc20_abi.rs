use ethers::contract::abigen;

abigen!(
    ERC20,
    r#"
        [
            function decimals() external view returns (uint8)
            function symbol() external view returns (string)
            function balanceOf(address) external view returns (uint256)
        ]
    "#
);

pub use ERC20;
