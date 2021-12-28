import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { MangoExamples } from '../target/types/mango_examples';

describe('mango-examples', () => {

  // Configure the client to use the local cluster.
  let provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MangoExamples as Program<MangoExamples>;

  it('Is initialized!', async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
