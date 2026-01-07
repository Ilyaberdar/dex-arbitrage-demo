// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV3FlashCallback {
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;
}

contract UniswapPoolMock {
    address public target;

    function setTarget(address _target) external {
        target = _target;
    }

    function flash(address recipient, uint256 amount0, uint256, bytes calldata data) external {
        // Send "loan"
        (bool sent,) = recipient.call(abi.encodeWithSignature(
            "uniswapV3FlashCallback(uint256,uint256,bytes)",
            amount0 / 1000, // 0.1% fee
            0,
            data
        ));
        require(sent, "Callback failed");
    }
}
