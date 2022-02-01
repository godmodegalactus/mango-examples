import * as anchor from '@project-serum/anchor';
import { Program, NodeWallet } from '@project-serum/anchor';
import * as mango_client from '@blockworks-foundation/mango-client';
import { MangoExamples } from '../target/types/mango_examples';
import * as web3 from '@solana/web3.js'
import * as splToken from '@solana/spl-token';
import { assert } from "chai";
import mlog from 'mocha-logger';
import {
  PublicKey,
} from '@solana/web3.js'
import { awaitTransactionSignatureConfirmation, sleep } from '@blockworks-foundation/mango-client';
const bs58 = require("bs58");

const idsIndex = 2;
const ids = mango_client.IDS['groups'][idsIndex];
type ClientAccountInfo = anchor.IdlAccounts<MangoExamples>["clientAccountInfo"];

describe('mango-examples', () => {

  // Configure the client to use the devnet cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const connection: web3.Connection = provider.connection;

  const program = anchor.workspace.MangoExamples as Program<MangoExamples>;
  const mango_group_account = new web3.PublicKey(ids.publicKey);
  const mango_programid = new web3.PublicKey(ids.mangoProgramId);

  const programId = program.programId;
  const owner = anchor.web3.Keypair.generate();
  let mango_account : PublicKey;

  it("Initialize mango account", async () => {
    // get some SOL into owners account
    let airdropSignature = await connection.requestAirdrop(
      owner.publicKey,
      web3.LAMPORTS_PER_SOL * 1);
    await connection.confirmTransaction(airdropSignature);

    // create an account with seed for mango program id
    const [acc, bump] = await PublicKey.findProgramAddress([Buffer.from("mango_account"), owner.publicKey.toBuffer()],program.programId);
    mango_account = acc;
    // call initailize account code
    await program.rpc.initializeAccount(
      bump,
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mango_account,
          user: owner.publicKey,
          systemProgram : web3.SystemProgram.programId,
        },
        signers: [owner],
      }
    );
  });

  const tokentIndex = 15; //usdc
  // initialize for deposit

  let mango = new mango_client.MangoClient(connection, new web3.PublicKey(mango_programid));
  let token: splToken.Token = null;
  let mango_cache: PublicKey = null;
  let node_bank_key: PublicKey = null;
  let root_bank: PublicKey = null;
  let vault: PublicKey = null;
  let token_mint:PublicKey = null;
  // create client
  const client = web3.Keypair.fromSecretKey(bs58.decode("588FU4PktJWfGfxtzpAAXywSNt74AvtroVzGfKkVN1LwRuvHwKGr851uH8czM5qm4iqLbs1kKoMKtMJG4ATR7Ld2"));//web3.Keypair.generate();

  it("Setup accounts", async () => {
    await sleep(10 * 1000); // to avoid too many request error
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

    token_mint = mango_group.tokens[tokentIndex].mint;
    token = new splToken.Token(
      connection,
      token_mint,
      splToken.TOKEN_PROGRAM_ID,
      client
    );
  });

  it("Deposit in mango", async () => {

    const client_token_acc = await token.getOrCreateAssociatedAccountInfo(client.publicKey);
    // create client into address
    const [client_acc_info, nonce] = await web3.PublicKey.findProgramAddress([Buffer.from("mango-client-info"), client.publicKey.toBuffer(), owner.publicKey.toBuffer()], program.programId);

    await program.rpc.deposit(
      new anchor.BN(100),
      nonce,
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mango_account,
          owner: owner.publicKey,
          mangoCacheAi: mango_cache,
          rootBankAi: root_bank,
          nodeBankAi: node_bank_key,
          vault: vault,
          clientTokenAccount: client_token_acc.address,
          client: client.publicKey,
          clientAccountInfo: client_acc_info,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
        },
        signers: [owner, client],
      }
    );

    let client_account_info: ClientAccountInfo = await program.account.clientAccountInfo.fetch(client_acc_info);
    assert.ok(client_account_info.clientKey.toString() == client.publicKey.toString());
    assert.ok(client_account_info.mint.toString() == token_mint.toString());
    assert.ok(client_account_info.amount.toNumber() == 100);

    //deposit 50 usdc more
    await program.rpc.deposit(
      new anchor.BN(50),
      nonce,
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mango_account,
          owner: owner.publicKey,
          mangoCacheAi: mango_cache,
          rootBankAi: root_bank,
          nodeBankAi: node_bank_key,
          vault: vault,
          clientTokenAccount: client_token_acc.address,
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
    assert.ok(client_account_info2.mint.toString() == token_mint.toString());
    assert.ok(client_account_info2.amount.toNumber() == 150);
  });

  it("Withdraw from mango", async () => {

    const client_token_acc = await token.getOrCreateAssociatedAccountInfo(client.publicKey);
    // create client into address
    const [client_acc_info, nonce] = await web3.PublicKey.findProgramAddress([Buffer.from("mango-client-info"), client.publicKey.toBuffer(), owner.publicKey.toBuffer()], program.programId);
    mlog.log("client_acc_info : " + client_acc_info);
    await program.rpc.withdraw(
      new anchor.BN(75),
      {
        accounts :{
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mango_account,
          owner: owner.publicKey,
          mangoCacheAi: mango_cache,
          rootBankAi: root_bank,
          nodeBankAi: node_bank_key,
          vault: vault,
          clientTokenAccount: client_token_acc.address,
          client: client.publicKey,
          clientAccountInfo: client_acc_info,
          tokenProgram: splToken.TOKEN_PROGRAM_ID,
        },
        signers: [owner],
      }
    );
  });

});
