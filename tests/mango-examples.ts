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
  let mngo = 'MNGO';
  let mango_account = null;

  it("Initialize mango account", async () => {
    // get some SOL into owners account
    let airdropSignature = await connection.requestAirdrop(
      owner.publicKey,
      web3.LAMPORTS_PER_SOL * 1);
    await connection.confirmTransaction(airdropSignature);

    // create an account with seed for mango program id
    {
      const acc = await web3.PublicKey.createWithSeed(
        owner.publicKey,
        mngo,
        mango_programid,
      );
      const size = mango_client.MangoAccountLayout.span;
      const lamports = await connection.getMinimumBalanceForRentExemption(size);

      const transaction = new web3.Transaction().add(
        web3.SystemProgram.createAccountWithSeed({
          fromPubkey: owner.publicKey,
          basePubkey: owner.publicKey,
          seed: mngo,
          newAccountPubkey: acc,
          lamports,
          space: size,
          programId: mango_programid,
        }));
      transaction.feePayer = owner.publicKey;
      let hash = await connection.getRecentBlockhash();
      console.log("blockhash", hash);
      transaction.recentBlockhash = hash.blockhash;
      const info = await connection.getAccountInfo(owner.publicKey);
      console.log(info);
      // Sign transaction, broadcast, and confirm
      const signature = await web3.sendAndConfirmTransaction(
        connection,
        transaction,
        [owner],
        { commitment: 'confirmed' },
      );
      mango_account = acc;
    }
    // call initailize account code
    await program.rpc.initializeAccount(
      {
        accounts: {
          mangoProgramAi: mango_programid,
          mangoGroup: mango_group_account,
          mangoAccount: mango_account,
          owner: owner.publicKey,
        },
        signers: [owner],
      }
    );
  });

  const tokentIndex = 15; //usdc
  // initialize for deposit

  let mango = new mango_client.MangoClient(connection, new web3.PublicKey(mango_programid));
  it("Deposit in mango", async () => {
    await sleep(10 * 1000); // to avoid too many request error
    // get mango data
    let mango_group = await mango.getMangoGroup(new web3.PublicKey(mango_group_account));
    let cache = await mango_group.loadCache(connection);
    let root_banks = await mango_group.loadRootBanks(connection);

    const node_bank_key = root_banks[tokentIndex].nodeBanks[0];
    const node_bank_acc = await connection.getAccountInfo(node_bank_key);
    const node_bank = mango_client.NodeBankLayout.decode(node_bank_acc.data);
    const vault = new web3.PublicKey(node_bank.vault);
    const mango_cache = cache.publicKey;
    const root_bank = root_banks[tokentIndex].publicKey;

    // create client
    const client = web3.Keypair.fromSecretKey(bs58.decode("588FU4PktJWfGfxtzpAAXywSNt74AvtroVzGfKkVN1LwRuvHwKGr851uH8czM5qm4iqLbs1kKoMKtMJG4ATR7Ld2"));//web3.Keypair.generate();
    await connection.confirmTransaction(await connection.requestAirdrop(
      client.publicKey,
      web3.LAMPORTS_PER_SOL * 1,
    ));
    await sleep(10 * 1000);

    const token_mint = mango_group.tokens[tokentIndex].mint;
    var token = new splToken.Token(
      connection,
      token_mint,
      splToken.TOKEN_PROGRAM_ID,
      client
    );

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
  });

});
