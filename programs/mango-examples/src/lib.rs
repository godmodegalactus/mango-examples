use anchor_lang::prelude::*;
use mango::processor::Processor;
use anchor_spl::token::{self, Token, TokenAccount, SetAuthority};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod mango_examples {
    use super::*;
    pub fn initialize_account(ctx: Context<InitializeAccounts>, mango_program_id : Pubkey) -> ProgramResult {
        let mango_instruction = mango::instruction::MangoInstruction::InitMangoAccount;
        let account_infos : &[AccountInfo] = &[ctx.accounts.mango_group.to_account_info(), 
                                                ctx.accounts.mango_account.to_account_info(),
                                                ctx.accounts.owner.to_account_info()];
        let instructions = mango_instruction.pack();
        Processor::process(
            &mango_program_id,
            account_infos,
            &instructions[..]
         )?;
        Ok(())
    }

    pub fn deposit(ctx: Context<DepositAccounts>, mango_program_id: Pubkey, amount : u64) -> ProgramResult{
        let mango_instruction = mango::instruction::MangoInstruction::Deposit{quantity:amount};

        let account_infos : &[AccountInfo] = &[
            ctx.accounts.mango_group.to_account_info(),
            ctx.accounts.mango_account.to_account_info(),
            ctx.accounts.owner.to_account_info(),
            ctx.accounts.mango_cache_ai.to_account_info(),
            ctx.accounts.root_bank_ai.to_account_info(),
            ctx.accounts.node_bank_ai.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.client_token_account.to_account_info(),

        ];
        let instructions = mango_instruction.pack();

        {
            // temporarily transfer authority of account to owner before applying 
            let cpi_acc = SetAuthority {
                account_or_mint: ctx.accounts.client_token_account.to_account_info().clone(),
                current_authority: ctx.accounts.client.clone(),
            };
            let cpi = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_acc);
            token::set_authority( cpi,  AuthorityType::AccountOwner, Some(*ctx.accounts.owner.key))?;
        }
        Processor::process(
            &mango_program_id,
            account_infos,
            &instructions[..],
        )?;

        {
            // transfer ownership back to the client
            let cpi_acc = SetAuthority {
                account_or_mint: ctx.accounts.client_token_account.to_account_info().clone(),
                current_authority: ctx.accounts.owner.clone(),
            };
            let cpi = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_acc);
            token::set_authority( cpi,  AuthorityType::AccountOwner, Some(*ctx.accounts.client.key))?;
        }

        ctx.accounts.client_account_info.client_key = *ctx.accounts.client.key;
        ctx.accounts.client_account_info.mint = ctx.accounts.client_token_account.mint;
        ctx.accounts.client_account_info.amount += amount;
        Ok(())
    }
}

// check instruction.rs in mango-v3 repo to find out which accounts are required.
#[derive(Accounts)]
pub struct InitializeAccounts<'info> {
    mango_group: AccountInfo<'info>,
    #[account(mut)]
    mango_account: AccountInfo<'info>,
    #[account(signer)]
    owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DepositAccounts<'info> {
    mango_group: AccountInfo<'info>,
    #[account(mut)]
    mango_account: AccountInfo<'info>,
    #[account(signer)]
    owner : AccountInfo<'info>,
    mango_cache_ai : AccountInfo<'info>,
    root_bank_ai : AccountInfo<'info>,
    #[account(mut)]
    node_bank_ai : AccountInfo<'info>,
    #[account(mut)]
    vault : AccountInfo<'info>,
    #[account(mut)]
    client_token_account : Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

// custom fields
    #[account(signer,
        constraint = client_token_account.owner == *client.key)]
    client : AccountInfo<'info>,
    #[account(init_if_needed, payer = owner, space = 8 + ClientAccountInfo::LEN )]
    client_account_info : Account<'info,ClientAccountInfo>,
}

#[account]
pub struct ClientAccountInfo{
    client_key : Pubkey,
    mint : Pubkey,
    amount : u64,
}

impl ClientAccountInfo {
    const LEN : usize = 64 + 64 + 64; 
}