import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
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
} from '@solana/web3.js'
import { awaitTransactionSignatureConfirmation, MarketKind, sleep } from '@blockworks-foundation/mango-client';
import {SerumUtils, DEX_ID,} from "./serum"
import {Pyth} from "./pyth"
import { Market } from "@project-serum/serum";

const bs58 = require("bs58");
const dex_program = DEX_ID;

interface TokenData {
    token : Token,
    rootBank : PublicKey,
    nodeBank : PublicKey,
    market : Market,

}

export class MangoUitls {
    connection : web3.Connection;
    authority : web3.Keypair;

    public static mango_programid = new web3.PublicKey("5vQp48Wx55Ft1PUAx8qWbsioNaLeXWVkyCq2XpQSv34M");

    public USDC :Token;
    public MNGO :Token;
    public SRM : Token;
    public BTC : Token;
    public ETH : Token;
    public SOL : Token;
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
        this.USDC = await Token.createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            6,
            TOKEN_PROGRAM_ID
        );

        this.MNGO = await Token.createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            6,
            TOKEN_PROGRAM_ID
        );

        this.SRM = await Token.createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            6,
            TOKEN_PROGRAM_ID
        );

        this.BTC = await Token.createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            6,
            TOKEN_PROGRAM_ID
        );

        this.ETH = await Token.createMint(
            this.connection,
            this.authority,
            this.authority.publicKey,
            this.authority.publicKey,
            6,
            TOKEN_PROGRAM_ID
        );

        this.SOL = await new Token(
            this.connection,
            NATIVE_MINT,
            TOKEN_PROGRAM_ID,
            this.authority
        );
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
        let usdc_vault = await this.USDC.createAccount(signerKey);
        let insurance_vault = await this.USDC.createAccount(signerKey);
        let fee_vault = await this.USDC.createAccount(TOKEN_PROGRAM_ID);

        let ix = mango_client.makeInitMangoGroupInstruction(
            MangoUitls.mango_programid,
            group_address,
            signerKey,
            this.authority.publicKey,
            this.USDC.publicKey,
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

        const transaction = new web3.Transaction();
        transaction.add(ix);
        transaction.add(ixCacheRootBank);
        transaction.add(ixupdateRootBank);
        transaction.feePayer = this.authority.publicKey;
        let hash = await this.connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        // Sign transaction, broadcast, and confirm
        const signature = await web3.sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.authority],
            { commitment: 'confirmed' },
        );
        this.mangoGroup = group_address;
        this.signerKey = signerKey;
        this.mangoCache = mango_cache;
        return group_address;
    }

    async initSpotMarket(token : Token) : Promise<PublicKey> {
        let oracle = await this.pythUtils.createPriceAccount();
        let market = await this.serumUtils.createMarket({
            baseToken : token,
            quoteToken: this.USDC,
            baseLotSize : 1000,
            quoteLotSize : 1000,
            feeRateBps : 0,
        });
        let root_bank_address = await this.createAccountForMango(mango_client.RootBankLayout.span);
        let node_bank_address = await this.createAccountForMango(mango_client.NodeBankLayout.span);
        let vault = await token.createAccount(this.signerKey);

        // temp update oracle price to initate pyth oracle
        await this.pythUtils.updatePriceAccount(oracle, {
            exponent: 6,
            aggregatePriceInfo: {
              price: 1000000n,
              conf: 1000n,
            },
          });
        // add spot market to mango
        let add_oracle_ix = mango_client.makeAddOracleInstruction(
            MangoUitls.mango_programid,
            this.mangoGroup,
            oracle.publicKey,
            this.authority.publicKey,
        );

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
        transaction.add(add_oracle_ix);
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
        await Promise.all([
            this.initSpotMarket(this.MNGO),
            this.initSpotMarket(this.BTC),
            this.initSpotMarket(this.ETH),
            this.initSpotMarket(this.SOL),
            this.initSpotMarket(this.SRM),]
        )
        return true;
    }
}