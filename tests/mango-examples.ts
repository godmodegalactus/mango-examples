import * as anchor from '@project-serum/anchor';
import { Program, NodeWallet } from '@project-serum/anchor';
import * as mango_client from '@blockworks-foundation/mango-client';
import { MangoExamples } from '../target/types/mango_examples';
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
import { awaitTransactionSignatureConfirmation, sleep } from '@blockworks-foundation/mango-client';
import {MangoUitls, User} from "./utils/mango_utils";
const bs58 = require("bs58");
import {DEX_ID, SerumUtils} from "./utils/serum"
import {Pyth} from "./utils/pyth"
import {TestUtils} from "./utils/test_utils"


type ClientAccountInfo = anchor.IdlAccounts<MangoExamples>["clientAccountInfo"];

describe('mango-examples', () => {
  // Configure the client to use the devnet cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const connection: web3.Connection = provider.connection;

  const program = anchor.workspace.MangoExamples as Program<MangoExamples>;
  const mango_programid = MangoUitls.mango_programid;
  const dex_program = new web3.PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

  const programId = program.programId;
  const owner = anchor.web3.Keypair.generate();
  const test_utils = new TestUtils(provider.connection, provider.wallet);
  let serum_utils = new SerumUtils(test_utils);
  let pyth_utils = new Pyth(connection, owner);
  const mango_utils = new MangoUitls(connection, owner, serum_utils, pyth_utils);

  let mangoAccount : PublicKey;
  let quoteMint : Token;
  let msrmMint : Token;
  let mango_group_account : PublicKey;

  let mango = new mango_client.MangoClient(connection, new web3.PublicKey(mango_programid));

  it("Initialize Mango", async() => {
    // get some SOL into owners account
    let airdropSignature = await connection.requestAirdrop(
      owner.publicKey,
      web3.LAMPORTS_PER_SOL * 100);
    await connection.confirmTransaction(airdropSignature);
    await mango_utils.initialize();
    
    mango_group_account = await mango_utils.initMangoGroup();
    await mango_utils.initSpotMarkets();
  });
  
  // create client
  let user : User = null;
  it("Initialize mango account", async () => {

    // create an account with seed for mango program id
    const [acc, bump] = await PublicKey.findProgramAddress([Buffer.from("mango_account"), owner.publicKey.toBuffer()],program.programId);
    mangoAccount = acc;
    // call initailize account code
    await program.rpc.initializeAccount(
      bump,
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount,
          user: owner.publicKey,
          systemProgram : web3.SystemProgram.programId,
        },
        signers: [owner],
      }
    );
    user = {
      user : owner,
      mangoAccountPk : mangoAccount,
      spotOrders : await mango_utils.createSpotAccounts(mangoAccount, owner)
    }
  });

  const tokentIndex = mango_client.QUOTE_INDEX; //usdc
  // initialize for deposit
  let mango_cache: PublicKey = null;
  let node_bank_key: PublicKey = null;
  let root_bank: PublicKey = null;
  let vault: PublicKey = null;
  let client_usdc_account : PublicKey = null;
  it("Setup accounts", async () => {
    const client = web3.Keypair.generate();
    // get mango data
    let mango_group = await mango.getMangoGroup(new web3.PublicKey(mango_group_account));
    let cache = await mango_group.loadCache(connection);
    let root_banks = await mango_group.loadRootBanks(connection);
    node_bank_key = root_banks[tokentIndex].nodeBanks[0];
    const node_bank_acc = await connection.getAccountInfo(node_bank_key);
    const node_bank = mango_client.NodeBankLayout.decode(node_bank_acc.data);
    vault = new web3.PublicKey(node_bank.vault);
    mango_cache = cache.publicKey;
    root_bank = root_banks[tokentIndex].publicKey;
    await connection.confirmTransaction(await connection.requestAirdrop(
      client.publicKey,
      web3.LAMPORTS_PER_SOL * 1,
    ));
  });

  it("Deposit in mango", async () => {
    let client = user.user;
    let usdcToken = await mango_utils.USDC.token;
    const client_token_acc = await usdcToken.createAccount(client.publicKey);
    client_usdc_account = client_token_acc;
    await usdcToken.mintTo(
      client_token_acc,
      owner.publicKey,
      [owner],
      100_000_000,
    );
    // create client into address
    const [client_acc_info, nonce] = await web3.PublicKey.findProgramAddress([Buffer.from("mango-client-info"), client.publicKey.toBuffer(), owner.publicKey.toBuffer()], program.programId);

    await program.state.rpc.deposit(
      new anchor.BN(100),
      nonce,
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mangoAccount,
          owner: owner.publicKey,
          mangoCacheAi: mango_cache,
          rootBankAi: root_bank,
          nodeBankAi: node_bank_key,
          vault: vault,
          clientTokenAccount: client_token_acc,
          client: client.publicKey,
          clientAccountInfo: client_acc_info,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [owner, client],
      }
    );
    await program.state.fetch();

    let client_account_info: ClientAccountInfo = await program.account.clientAccountInfo.fetch(client_acc_info);
    assert.ok(client_account_info.clientKey.toString() == client.publicKey.toString());
    assert.ok(client_account_info.mint.toString() == usdcToken.publicKey.toString());
    assert.ok(client_account_info.amount.toNumber() == 100);

    //deposit 50 usdc more
    await program.rpc.deposit(
      new anchor.BN(50),
      nonce,
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mangoAccount,
          owner: owner.publicKey,
          mangoCacheAi: mango_cache,
          rootBankAi: root_bank,
          nodeBankAi: node_bank_key,
          vault: vault,
          clientTokenAccount: client_token_acc,
          client: client.publicKey,
          clientAccountInfo: client_acc_info,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [owner, client],
      }
    );
    let client_account_info2: ClientAccountInfo = await program.account.clientAccountInfo.fetch(client_acc_info);
    assert.ok(client_account_info2.clientKey.toString() == client.publicKey.toString());
    assert.ok(client_account_info2.mint.toString() == usdcToken.publicKey.toString());
    assert.ok(client_account_info2.amount.toNumber() == 150);
  });

  it("Withdraw from mango", async () => {
    let client = user.user;
    const client_token_acc = client_usdc_account;
    // create client into address
    const [client_acc_info, nonce] = await web3.PublicKey.findProgramAddress([Buffer.from("mango-client-info"), client.publicKey.toBuffer(), owner.publicKey.toBuffer()], program.programId);
    mlog.log("client_acc_info : " + client_acc_info);
    await program.rpc.withdraw(
      new anchor.BN(75),
      {
        accounts :{
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mangoAccount,
          owner: owner.publicKey,
          mangoCacheAi: mango_cache,
          rootBankAi: root_bank,
          nodeBankAi: node_bank_key,
          vault: vault,
          clientTokenAccount: client_token_acc,
          client: client.publicKey,
          clientAccountInfo: client_acc_info,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
        },
        signers: [owner],
      }
    );
  });

});
