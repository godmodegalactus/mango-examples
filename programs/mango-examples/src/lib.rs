use anchor_lang::prelude::*;
use mango::instruction::{deposit, MangoInstruction};
use anchor_spl::token::{self, Token, TokenAccount, SetAuthority};
use spl_token::instruction::AuthorityType;
use solana_program::instruction::{AccountMeta, Instruction};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

pub mod mango_v3_id {
    use solana_program::declare_id;
    declare_id!("mv3ekLzLbnVPNxjSKvqBpU3ZeZXPQdEC3bp5MDEBG68");
}

#[program]
pub mod mango_examples {
    use solana_program::program::invoke_signed;

    use super::*;
    pub fn initialize_account(ctx: Context<InitializeAccounts>) -> ProgramResult {
        let program_id : Pubkey = *ctx.program_id;
        let mango_instruction = MangoInstruction::InitMangoAccount;
        let account_infos : &[AccountInfo] = &[ ctx.accounts.mango_program_ai.to_account_info().clone(),
                                                ctx.accounts.mango_group.to_account_info().clone(), 
                                                ctx.accounts.mango_account.to_account_info().clone(),
                                                ctx.accounts.owner.to_account_info().clone()];

        let group_key : Pubkey = *ctx.accounts.mango_group.to_account_info().key;
        let accounts = vec![
            AccountMeta::new_readonly(group_key, false),
            AccountMeta::new(*ctx.accounts.mango_account.to_account_info().key, false),
            AccountMeta::new_readonly(*ctx.accounts.owner.to_account_info().key, true),
        ];
        let data = mango_instruction.pack();
        let sol_instruction = solana_program::instruction::Instruction {
            program_id,
            accounts,
            data,
        };
        let seeds = &[
            ctx.accounts.owner.to_account_info().key.as_ref(),
        ];
        let signer = &[&seeds[..]];

        invoke_signed( &sol_instruction, account_infos, signer)?;

        Ok(())
    }

    pub fn deposit(ctx: Context<DepositAccounts>, amount : u64) -> ProgramResult{
        let accounts = ctx.accounts;
        let account_infos : &[AccountInfo] = &[
            accounts.mango_program_ai.clone(),
            accounts.mango_group.clone(),
            accounts.mango_account.clone(),
            accounts.owner.clone(),
            accounts.mango_cache_ai.clone(),
            accounts.root_bank_ai.clone(),
            accounts.node_bank_ai.clone(),
            accounts.vault.clone(),
            accounts.client_token_account.to_account_info().clone(),
            accounts.token_program.to_account_info().clone(),

        ];
        {
            // temporarily transfer authority of account to owner before applying 
            let cpi_acc = SetAuthority {
                account_or_mint: accounts.client_token_account.to_account_info().clone(),
                current_authority: accounts.client.clone(),
            };
            let cpi = CpiContext::new(accounts.token_program.to_account_info(), cpi_acc);
            token::set_authority( cpi,  AuthorityType::AccountOwner, Some(*accounts.owner.key))?;
        }

        let seeds = &[
            accounts.owner.to_account_info().key.as_ref(),
        ];
        let signer = &[&seeds[..]];
        let deposit_instruction = mango::instruction::deposit(accounts.mango_program_ai.key,
            accounts.mango_group.key,
            accounts.mango_account.key,
            accounts.owner.key,
            accounts.mango_cache_ai.key,
            accounts.root_bank_ai.key,
            accounts.node_bank_ai.key,
            accounts.vault.key,
            accounts.client_token_account.to_account_info().key,

            amount)?;
            // call mango
        invoke_signed( &deposit_instruction, account_infos, signer) ?;

        {
            // transfer ownership back to the client
            let cpi_acc = SetAuthority {
                account_or_mint: accounts.client_token_account.to_account_info().clone(),
                current_authority: accounts.owner.clone(),
            };
            let cpi = CpiContext::new(accounts.token_program.to_account_info(), cpi_acc);
            token::set_authority( cpi,  AuthorityType::AccountOwner, Some(*accounts.client.key))?;
        }

        accounts.client_account_info.client_key = *accounts.client.key;
        accounts.client_account_info.mint = accounts.client_token_account.mint;
        accounts.client_account_info.amount += amount;
        Ok(())
    }
}

// check instruction.rs in mango-v3 repo to find out which accounts are required.
#[derive(Accounts)]
pub struct InitializeAccounts<'info> {
    mango_program_ai : AccountInfo<'info>,
    mango_group: AccountInfo<'info>,
    #[account(mut)]
    mango_account: AccountInfo<'info>,
    #[account(signer)]
    owner: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DepositAccounts<'info> {
    mango_program_ai : AccountInfo<'info>,
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