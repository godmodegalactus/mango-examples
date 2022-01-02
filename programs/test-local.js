const mango_client = require('@blockworks-foundation/mango-client');
//import { IDS } from "@blockworks-foundation/mango-client";
//import { Connection, PublicKey } from "@solana/web3.js";
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
// if devnet =2 mainnet=0
const idsIndex = 2;
const ids = mango_client.IDS['groups'][idsIndex];


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
  //console.log(airdropSignature);
  
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
      const transaction =  new web3.Transaction().add(
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
          {commitment: 'confirmed'},
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
            {commitment: 'confirmed'},
        );
   }
  // #endregion main
}

console.log('Running client.');
main().then(() => console.log('Success'));
