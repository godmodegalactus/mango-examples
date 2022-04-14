import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { OpenOrders } from "@project-serum/serum";
import * as mango_client from '@blockworks-foundation/mango-client';
import * as web3 from '@solana/web3.js'
import * as splToken from '@solana/spl-token';
import {
  NATIVE_MINT,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";

import { assert } from "chai";
import mlog from 'mocha-logger';
import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { awaitTransactionSignatureConfirmation, MarketKind, sleep } from '@blockworks-foundation/mango-client';
import {SerumUtils, DEX_ID,} from "./serum"
import {Pyth} from "./pyth"
import { Market, OpenOrders } from "@project-serum/serum";

const bs58 = require("bs58");
const dex_program = DEX_ID;

export interface TokenData {
    token : Token,
    rootBank : PublicKey,
    nodeBank : PublicKey,
    market : Market,
    marketIndex : u64,
    starting_price : number,
}

export interface User {
    user: Keypair,
    mangoAccountPk : PublicKey,
    spotOrders : PublicKey[];
}

export class MangoUitls {
    connection : web3.Connection;
    authority : web3.Keypair;

    public static mango_programid = new web3.PublicKey("5vQp48Wx55Ft1PUAx8qWbsioNaLeXWVkyCq2XpQSv34M");

    public USDC :TokenData;
    public MNGO :TokenData;
    public SRM : TokenData;
    public BTC : TokenData;
    public ETH : TokenData;
    public SOL : TokenData;
    public MSRM : Token;

    public mangoGroup : PublicKey;
    signerKey: PublicKey;
    mangoCache : PublicKey;
    usdcRootBank: PublicKey;
    usdcNodeBank: PublicKey;

    serumUtils : SerumUtils;
    pythUtils : Pyth;
    constructor (connection : web3.Connection, 
        authority : web3.Keypair,
        serumUtils : SerumUtils,
        pythUtils : Pyth) {
        this.connection = connection;
        this.authority = authority;
        this.serumUtils = serumUtils;
        this.pythUtils = pythUtils;
    }

    public async initialize() {
        this.USDC = { 
            token: await Token.createMint(
                    this.connection,
                    this.authority,
                    this.authority.publicKey,
                    this.authority.publicKey,
                    6,
                    TOKEN_PROGRAM_ID),
            rootBank : null,
            nodeBank : null,
            market : null,
            marketIndex : new anchor.BN(0),
            starting_price : 1,
        }
        this.MNGO = { 
            token: await Token.createMint(
                    this.connection,
                    this.authority,
                    this.authority.publicKey,
                    this.authority.publicKey,
                    6,
                    TOKEN_PROGRAM_ID),
            rootBank : null,
            nodeBank : null,
            market : null,
            marketIndex : new anchor.BN(0),
            starting_price : 0.1,
        }

        this.SRM = { 
            token: await Token.createMint(
                    this.connection,
                    this.authority,
                    this.authority.publicKey,
                    this.authority.publicKey,
                    6,
                    TOKEN_PROGRAM_ID),
            rootBank : null,
            nodeBank : null,
            market : null,
            marketIndex : new anchor.BN(4),
            starting_price : 2,
        }

        this.BTC = { 
            token: await Token.createMint(
                    this.connection,
                    this.authority,
                    this.authority.publicKey,
                    this.authority.publicKey,
                    6,
                    TOKEN_PROGRAM_ID),
            rootBank : null,
            nodeBank : null,
            market : null,
            marketIndex : new anchor.BN(1),
            starting_price : 40000,
        }

        this.ETH = { 
            token: await Token.createMint(
                    this.connection,
                    this.authority,
                    this.authority.publicKey,
                    this.authority.publicKey,
                    6,
                    TOKEN_PROGRAM_ID),
            rootBank : null,
            nodeBank : null,
            market : null,
            marketIndex : new anchor.BN(2),
            starting_price : 4000,
        }

        this.SOL = { 
            token: await Token.createMint(
                    this.connection,
                    this.authority,
                    this.authority.publicKey,
                    this.authority.publicKey,
                    6,
                    TOKEN_PROGRAM_ID),
            rootBank : null,
            nodeBank : null,
            market : null,
            marketIndex : new anchor.BN(3),
            starting_price : 150,
        }

        this.MSRM = await Token.createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            6,
            TOKEN_PROGRAM_ID);
    }

    async createAccountForMango(size : number) : Promise<web3.PublicKey> {
        const lamports = await this.connection.getMinimumBalanceForRentExemption(size);
        let address = web3.Keypair.generate();

        const transaction = new web3.Transaction().add(
            web3.SystemProgram.createAccount({
                fromPubkey: this.authority.publicKey,
                newAccountPubkey: address.publicKey,
                lamports,
                space: size,
                programId: MangoUitls.mango_programid,
            }))

        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.authority, address],
            { commitment: 'confirmed' },
        );
        return address.publicKey;
    }

    public async initMangoGroup() : Promise<web3.PublicKey> {

        const size = mango_client.MangoGroupLayout.span;
        let group_address = await this.createAccountForMango( size);
        let root_bank_address = await this.createAccountForMango(mango_client.RootBankLayout.span);
        let node_bank_address = await this.createAccountForMango(mango_client.NodeBankLayout.span);
        let mango_cache = await this.createAccountForMango(mango_client.MangoCacheLayout.span);

        const { signerKey, signerNonce } = await mango_client.createSignerKeyAndNonce(
            MangoUitls.mango_programid,
            group_address,
          );

        //const [signer, nonce] = await web3.PublicKey.findProgramAddress([group_address.toBuffer()], MangoUitls.mango_programid);
        let usdc_vault = await this.USDC.token.createAccount(signerKey);
        let insurance_vault = await this.USDC.token.createAccount(signerKey);
        let fee_vault = await this.USDC.token.createAccount(TOKEN_PROGRAM_ID);
        let msrm_vault = await this.MSRM.createAccount(signerKey);
        this.USDC.rootBank = root_bank_address;
        this.USDC.nodeBank = node_bank_address;
        
        let ix = mango_client.makeInitMangoGroupInstruction(
            MangoUitls.mango_programid,
            group_address,
            signerKey,
            this.authority.publicKey,
            this.USDC.token.publicKey,
            usdc_vault,
            node_bank_address,
            root_bank_address,
            insurance_vault,
            PublicKey.default,
            fee_vault,
            mango_cache,
            dex_program,
            new anchor.BN(signerNonce),
            new anchor.BN(10),
            mango_client.I80F48.fromNumber(0.7),
            mango_client.I80F48.fromNumber(0.06),
            mango_client.I80F48.fromNumber(1.5),
          );

        let ixCacheRootBank = mango_client.makeCacheRootBankInstruction(MangoUitls.mango_programid,
            group_address,
            mango_cache,
            [root_bank_address]);

        let ixupdateRootBank = mango_client.makeUpdateRootBankInstruction(MangoUitls.mango_programid,
                group_address,
                mango_cache,
                root_bank_address,
                [node_bank_address]);
        
        await this.processInstruction(ix, [this.authority]);
        await this.processInstruction(ixCacheRootBank, [this.authority]);
        await this.processInstruction(ixupdateRootBank, [this.authority]);
        // const transaction = new web3.Transaction();
        // transaction.add(ix);
        // transaction.add(ixCacheRootBank);
        // transaction.add(ixupdateRootBank);
        // transaction.feePayer = this.authority.publicKey;
        // let hash = await this.connection.getRecentBlockhash();
        // transaction.recentBlockhash = hash.blockhash;
        // // Sign transaction, broadcast, and confirm
        // const signature = await web3.sendAndConfirmTransaction(
        //     this.connection,
        //     transaction,
        //     [this.authority],
        //     { commitment: 'confirmed' },
        // );
        this.mangoGroup = group_address;
        this.signerKey = signerKey;
        this.mangoCache = mango_cache;
        return group_address;
    }

    async initSpotMarket(tokendata : TokenData) : Promise<PublicKey> {
        const token = tokendata.token;
        let oracle = await this.pythUtils.createPriceAccount();
        // temp update oracle price to initate pyth oracle
        await this.pythUtils.updatePriceAccount(oracle, {
            exponent: 6,
            aggregatePriceInfo: {
            price: 1000000n,
            conf: 1000n,
            },
        });
        let market = await this.serumUtils.createMarket({
            baseToken : token,
            quoteToken: this.USDC.token,
            baseLotSize : 1000,
            quoteLotSize : 1000,
            feeRateBps : 0,
        });
        let root_bank_address = await this.createAccountForMango(mango_client.RootBankLayout.span);
        let node_bank_address = await this.createAccountForMango(mango_client.NodeBankLayout.span);
        let vault = await token.createAccount(this.signerKey);

        tokendata.nodeBank = node_bank_address;
        tokendata.rootBank = root_bank_address;
        tokendata.market = market;

        // add spot market to mango
        {
            let add_oracle_ix = mango_client.makeAddOracleInstruction(
                MangoUitls.mango_programid,
                this.mangoGroup,
                oracle.publicKey,
                this.authority.publicKey,
            );
            const transaction = new web3.Transaction();
            transaction.add(add_oracle_ix);;
            transaction.feePayer = this.authority.publicKey;
            let hash = await this.connection.getRecentBlockhash();
            transaction.recentBlockhash = hash.blockhash;
            // Sign transaction, broadcast, and confirm
            await web3.sendAndConfirmTransaction(
                this.connection,
                transaction,
                [this.authority],
                { commitment: 'confirmed' },
            );
        }
        let add_spot_ix = mango_client.makeAddSpotMarketInstruction(
            MangoUitls.mango_programid,
            this.mangoGroup,
            oracle.publicKey,
            market.address,
            DEX_ID,
            token.publicKey,
            node_bank_address,
            vault,
            root_bank_address,
            this.authority.publicKey,
            mango_client.I80F48.fromNumber(10),
            mango_client.I80F48.fromNumber(5),
            mango_client.I80F48.fromNumber(0.05),
            mango_client.I80F48.fromNumber(0.7),
            mango_client.I80F48.fromNumber(0.06),
            mango_client.I80F48.fromNumber(1.5),
        );

        let ixCacheRootBank = mango_client.makeCacheRootBankInstruction(MangoUitls.mango_programid,
            this.mangoGroup,
            this.mangoCache,
            [root_bank_address]);

        let ixupdateRootBank = mango_client.makeUpdateRootBankInstruction(MangoUitls.mango_programid,
            this.mangoGroup,
            this.mangoCache,
            root_bank_address,
            [node_bank_address]);
        
        const transaction = new web3.Transaction();
        transaction.add(add_spot_ix);
        transaction.add(ixCacheRootBank);
        transaction.add(ixupdateRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
        return token.publicKey;
    }

    async initSpotMarkets() : Promise<Boolean> {
        
        await this.initSpotMarket(this.MNGO);
        await this.initSpotMarket(this.BTC);
        await this.initSpotMarket(this.ETH);
        await this.initSpotMarket(this.SOL);
        await this.initSpotMarket(this.SRM);
    
        return true;
    }

    async initOpenOrdersForAccount(mangoAccount : PublicKey, owner : web3.Keypair, token : TokenData) {

        const space = OpenOrders.getLayout(dex_program).span;
        const lamports = await this.connection.getMinimumBalanceForRentExemption(space);

        const openOrders = new Keypair();
        const trans = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: owner.publicKey,
                newAccountPubkey: openOrders.publicKey,
                programId: DEX_ID,
                lamports,
                space,
            })
        );

        await sendAndConfirmTransaction(this.connection, trans, [
            owner,
            openOrders,
        ]);
        
        let ixCreateOpenOrders = mango_client.makeCreateSpotOpenOrdersInstruction(
            MangoUitls.mango_programid,
            this.mangoGroup,
            mangoAccount,
            owner.publicKey,
            DEX_ID,
            openOrders.publicKey,
            token.market.address,
            this.signerKey,
        )

        let ixInitOpenOrders = mango_client.makeInitSpotOpenOrdersInstruction (
            MangoUitls.mango_programid,
            this.mangoGroup,
            mangoAccount,
            owner.publicKey,
            dex_program,
            openOrders.publicKey,
            token.market.address,
            this.signerKey,
        );

        const transaction = new web3.Transaction();
        transaction.add(ixCreateOpenOrders);
        transaction.add(ixInitOpenOrders);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [owner],
            { commitment: 'confirmed' },
        );

        return openOrders.publicKey;
    }

    async initOpenOrdersForAccountForAllTokens(mangoAccount : PublicKey, owner : web3.Keypair) {
        return await Promise.all([
            this.initOpenOrdersForAccount(mangoAccount, owner, this.MNGO),
            this.initOpenOrdersForAccount(mangoAccount, owner, this.BTC),
            this.initOpenOrdersForAccount(mangoAccount, owner, this.ETH),
            this.initOpenOrdersForAccount(mangoAccount, owner, this.SOL),
            this.initOpenOrdersForAccount(mangoAccount, owner, this.SRM),
        ]);
    }

    async refreshTokenCache(tokenData : TokenData) {
        
        let ixupdateRootBank = mango_client.makeUpdateRootBankInstruction(MangoUitls.mango_programid,
            this.mangoGroup,
            this.mangoCache,
            tokenData.rootBank,
            [tokenData.nodeBank]);
        
        const transaction = new web3.Transaction();
        transaction.add(ixupdateRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
    }

    async refreshRootBankCache() {
        let ixCacheRootBank = mango_client.makeCacheRootBankInstruction(MangoUitls.mango_programid,
            this.mangoGroup,
            this.mangoCache,
            [this.USDC.rootBank, this.MNGO.rootBank, this.BTC.rootBank, this.ETH.rootBank, this.SOL.rootBank, this.SRM.rootBank]);

        const transaction = new web3.Transaction();
        transaction.add(ixCacheRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
    }

    async refreshAllTokenCache() {
        await Promise.all(
            [
                this.refreshRootBankCache(),
                this.refreshTokenCache(this.USDC),
                this.refreshTokenCache(this.MNGO),
                this.refreshTokenCache(this.BTC),
                this.refreshTokenCache(this.ETH),
                this.refreshTokenCache(this.SOL),
                this.refreshTokenCache(this.SRM),
            ]
        );
    }

    async createAccount( address: PublicKey, owner: Keypair, programId: PublicKey, size : number) {
        const lamports = await this.connection.getMinimumBalanceForRentExemption(size);

        const transaction = new Transaction().add(
            SystemProgram.createAccount({
                fromPubkey: owner.publicKey,
                newAccountPubkey: address,
                lamports,
                space: size,
                programId,
            }))

        transaction.feePayer = owner.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [owner],
            { commitment: 'confirmed' },
        );
    }

    async processInstruction(ix: anchor.web3.TransactionInstruction, signers:Array<web3.Signer>)
    {
        const transaction = new web3.Transaction();
        transaction.add(ix);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            signers,
            { commitment: 'confirmed' },
        );
    }

    async createSpotAccount(mangoAccount : PublicKey, owner : Keypair, tokenData: TokenData) : Promise<PublicKey> {
        let marketIndex : anchor.BN = tokenData.marketIndex;
        const [spotOpenOrdersAccount, _bump] = await PublicKey.findProgramAddress(
                [
                    mangoAccount.toBuffer(), 
                    marketIndex.toBuffer("le", 8), 
                    Buffer.from("OpenOrders"),
                ], MangoUitls.mango_programid);
        
        const space = OpenOrders.getLayout(DEX_ID).span;
        //await this.createAccount(spotAccount, owner, DEX_ID, space);
        const lamports = await this.connection.getMinimumBalanceForRentExemption(space);
        
        let ix1 = await mango_client.createAccountInstruction(
            this.connection,
            owner.publicKey,
            space,
            DEX_ID,
            lamports,
          );
        await this.processInstruction(ix1.instruction, [owner,ix1.account]);

        let ix2 = mango_client.makeCreateSpotOpenOrdersInstruction(
            MangoUitls.mango_programid,
            this.mangoGroup,
            mangoAccount,
            owner.publicKey,
            DEX_ID,
            spotOpenOrdersAccount,
            tokenData.market.address,
            this.signerKey,
        )
        await this.processInstruction(ix2, [owner]);

        let ix3 = mango_client.makeInitSpotOpenOrdersInstruction(
            MangoUitls.mango_programid,
            this.mangoGroup,
            mangoAccount,
            owner.publicKey,
            DEX_ID,
            spotOpenOrdersAccount,
            tokenData.market.address,
            this.signerKey,
        )
        //await this.processInstruction(ix3, [owner]);
        
        // const transaction = new web3.Transaction();
        // transaction.add(ix1.instruction);
        // transaction.add(ix2);
        // transaction.add(ix3);
        // transaction.feePayer = this.authority.publicKey;
        // let hash = await this.connection.getRecentBlockhash();
        // transaction.recentBlockhash = hash.blockhash;
        // // Sign transaction, broadcast, and confirm
        // await web3.sendAndConfirmTransaction(
        //     this.connection,
        //     transaction,
        //     [owner, ix1.account],
        //     { commitment: 'confirmed' },
        // );

        return spotOpenOrdersAccount;
    }

    async createSpotAccounts(mangoAccount : PublicKey, owner : Keypair,) : Promise<PublicKey[]> {
        return [
            await this.createSpotAccount(mangoAccount, owner, this.MNGO),
            await this.createSpotAccount(mangoAccount, owner, this.BTC),
            await this.createSpotAccount(mangoAccount, owner, this.ETH),
            await this.createSpotAccount(mangoAccount, owner, this.SOL),
            await this.createSpotAccount(mangoAccount, owner, this.SRM),
        ];
    }

    async createUser(): Promise<User> {
        const user = web3.Keypair.generate();
        await this.connection.requestAirdrop(
            user.publicKey,
            web3.LAMPORTS_PER_SOL * 100);

        const [acc, _bump] = await PublicKey.findProgramAddress([Buffer.from("mango_account"), user.publicKey.toBuffer()], MangoUitls.mango_programid);
        
        const ix = mango_client.makeInitMangoAccountInstruction(
            MangoUitls.mango_programid,
            this.mangoGroup,
            acc,
            user.publicKey,
        )
        const transaction = new web3.Transaction();
        transaction.add(ix);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [user, this.authority],
            { commitment: 'confirmed' },
        );

        return {
            user,
            mangoAccountPk : acc,
            spotOrders : await this.createSpotAccounts(acc, user),
        }
    }
}