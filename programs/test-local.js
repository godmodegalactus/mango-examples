const mango_client = require('@blockworks-foundation/mango-client');
//import { IDS } from "@blockworks-foundation/mango-client";
//import { Connection, PublicKey } from "@solana/web3.js";
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const { sleep, makeSettlePnlInstruction } = require('@blockworks-foundation/mango-client');
const buffer_layout = require('buffer-layout');
// if devnet =2 mainnet=0
const idsIndex = 2;
const ids = mango_client.IDS['groups'][idsIndex];
const bs58 = require("bs58");

// Configure the local cluster.
//anchor.setProvider(anchor.Provider.devnet());

async function main() {
    // #region main
    // Read the generated IDL.
    const idl_example = JSON.parse(require('fs').readFileSync('../target/idl/mango_examples.json', 'utf8'));
    let mngo = 'MNGO';
    // Address of the deployed program.
    const programId = new web3.PublicKey('E7ptmvHXGv6rc2eat9pT3tb77NsEiDhiZXeKDtk7frGn');
    const mango_group_account = new web3.PublicKey(ids.publicKey);
    const mango_programid = new web3.PublicKey(ids.mangoProgramId);
    const TOKEN_PROGRAM = new web3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const owner = web3.Keypair.generate();
    let mango_account = null;
    //   const [mango_account, account_nonce] = await web3.PublicKey.findProgramAddress( 
    //       [owner.publicKey.toBuffer(),], 
    //       programId);

    console.log("ids are");
    console.log(programId.toString());
    console.log(mango_group_account.toString());
    console.log(mango_programid.toString());
    console.log(owner.publicKey.toString());


    const connection = new web3.Connection(
        web3.clusterApiUrl('devnet'),
        'confirmed',
    );

    let airdropSignature = await connection.requestAirdrop(
        owner.publicKey,
        web3.LAMPORTS_PER_SOL * 2,
    );
    await connection.confirmTransaction(airdropSignature);
    {
        //create mango address
        const seed = [Buffer.from(mngo)];
        const acc = await web3.PublicKey.createWithSeed(
            owner.publicKey,
            seed,
            mango_programid,
        );
        const size = mango_client.MangoAccountLayout.span;
        console.log("account address : " + acc);
        console.log("size " + size);
        const lamports = await connection.getMinimumBalanceForRentExemption(size);
        const transaction = new web3.Transaction().add(
            web3.SystemProgram.createAccountWithSeed({
                fromPubkey: owner.publicKey,
                basePubkey: owner.publicKey,
                seed: seed,
                newAccountPubkey: acc,
                lamports,
                space: size,
                programId: mango_programid,
            }))

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
    console.log(mango_account.toString());

    // create mango account
    {
        // Add token transfer instructions to transaction
        let keys = [
            //{ isSigner: false, isWritable: false, pubkey: programId},
            { isSigner: false, isWritable: false, pubkey: mango_programid },
            { isSigner: false, isWritable: false, pubkey: mango_group_account },
            { isSigner: false, isWritable: true, pubkey: mango_account },
            { isSigner: true, isWritable: false, pubkey: owner.publicKey },
        ];

        const data = [74, 115, 99, 93, 197, 69, 103, 7];

        const transaction = new web3.Transaction().add(
            new web3.TransactionInstruction({
                keys,
                programId,
                data
            }
            ),
        );
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
    }
    console.log("sleeping for 1 minute (so that we do not get errors)");
    await sleep(60000);
    // initialize for deposit

    let client = new mango_client.MangoClient(connection, new web3.PublicKey(mango_programid));
    let mango_group = await client.getMangoGroup(new web3.PublicKey(mango_group_account));
    let cache = await mango_group.loadCache(connection);
    let root_banks = await mango_group.loadRootBanks(connection);

    const node_bank_key = root_banks[3].nodeBanks[0];
    const node_bank_acc = await connection.getAccountInfo(node_bank_key);
    const node_bank = mango_client.NodeBankLayout.decode(node_bank_acc.data);
    const vault = new web3.PublicKey(node_bank.vault);
    const mango_cache = cache.publicKey;
    const root_bank = root_banks[3].publicKey;
    const client1 = web3.Keypair.fromSecretKey(bs58.decode("588FU4PktJWfGfxtzpAAXywSNt74AvtroVzGfKkVN1LwRuvHwKGr851uH8czM5qm4iqLbs1kKoMKtMJG4ATR7Ld2"));
    
    const token_mint = new web3.PublicKey("So11111111111111111111111111111111111111112");
    console.log("token mint : " + token_mint)
    var token = new splToken.Token(
        connection,
        token_mint,
        splToken.TOKEN_PROGRAM_ID,
        client1
      );
    //give client 2 SOL
    airdropSignature = await connection.requestAirdrop(
        client1.publicKey,
        web3.LAMPORTS_PER_SOL * 2,
    );
    await connection.confirmTransaction(airdropSignature);

    const client_token_acc  = await token.getOrCreateAssociatedAccountInfo(
        client1.publicKey
      );
    console.log("client account : " + client_token_acc.address);
    console.log("root_bank account : " + root_bank);
    console.log("node_bank account : " + node_bank_key);
    console.log("vault account : " + vault);
    console.log("mango_cache account : " + mango_cache);
    console.log("client_token account : " + client_token_acc.address);
    await sleep(10000);

    airdropSignature = await connection.requestAirdrop(
        client_token_acc.address,
        web3.LAMPORTS_PER_SOL * 2,
    );
    await connection.confirmTransaction(airdropSignature);
    {
        const [client_acc_info, nonce] = await web3.PublicKey.findProgramAddress( [client1.publicKey.toBuffer()], programId); 
        console.log("client_acc_info : " + client_acc_info);
        let keys = [
            { isSigner: false, isWritable: false, pubkey: mango_programid },
            { isSigner: false, isWritable: false, pubkey: mango_group_account },
            { isSigner: false, isWritable: true, pubkey: mango_account },
            { isSigner: true, isWritable: false, pubkey: owner.publicKey },
            { isSigner: false, isWritable: false, pubkey: mango_cache },
            { isSigner: false, isWritable: false, pubkey: root_bank },
            { isSigner: false, isWritable: true, pubkey: node_bank_key },
            { isSigner: false, isWritable: true, pubkey: vault },
            { isSigner: false, isWritable: true, pubkey: client_token_acc.address},
            { isSigner: false, isWritable: false, pubkey: splToken.TOKEN_PROGRAM_ID},
            { isSigner: false, isWritable: false, pubkey: web3.SystemProgram.programId},
            { isSigner: true, isWritable: false, pubkey: client1.publicKey},
            //{ isSigner: false, isWritable: true, pubkey: client_acc_info},

        ];
        const amount =  new splToken.u64( 1000 );
        let data = Buffer.concat([Buffer.from([242, 35, 198, 137, 82, 225, 242, 182]), amount.toBuffer()]);
        data = Buffer.concat([data, Buffer.from([nonce])]);
        const transaction = new web3.Transaction().add(
            new web3.TransactionInstruction({
                keys,
                programId,
                data
            }
            ),
        );
        transaction.feePayer = owner.publicKey;
        let hash = await connection.getRecentBlockhash();
        transaction.recentBlockhash = hash.blockhash;
        const info = await connection.getAccountInfo(owner.publicKey);
        // Sign transaction, broadcast, and confirm
        const signature = await web3.sendAndConfirmTransaction(
            connection,
            transaction,
            [owner, client1],
            { commitment: 'confirmed' },
        );
    }
    // #endregion main
}

console.log('Running client.');
main().then(() => console.log('Success'));
