use anchor_lang::prelude::*;
use mango::instruction::{MangoInstruction};
use anchor_spl::token::{self, Token, TokenAccount, SetAuthority, CloseAccount};
use spl_token::instruction::AuthorityType;
use solana_program::instruction::{AccountMeta};

// Update this id to your program id before deploying to devnet
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

const MANGO_ACCOUNT : &[u8] = b"mango_account";

#[program]
pub mod mango_examples {
    use solana_program::program::invoke;

    use super::*;
    pub fn initialize_account(ctx: Context<InitializeAccounts>, _bump : u8) -> ProgramResult {
        msg!("started");
        
        let mango_instruction = MangoInstruction::InitMangoAccount;
        let account_infos : &[AccountInfo] = &[ ctx.accounts.mango_program_ai.to_account_info().clone(),
                                                ctx.accounts.mango_group.to_account_info().clone(), 
                                                ctx.accounts.mango_account.to_account_info().clone(),
                                                ctx.accounts.user.to_account_info().clone()];
        msg!("Create instructions");
        let group_key : Pubkey = *ctx.accounts.mango_group.to_account_info().key;
        let accounts = vec![
            AccountMeta::new_readonly(group_key, false),
            AccountMeta::new(*ctx.accounts.mango_account.to_account_info().key, false),
            AccountMeta::new_readonly(*ctx.accounts.user.to_account_info().key, true),
        ];
        let data = mango_instruction.pack();
        let sol_instruction = solana_program::instruction::Instruction {
            program_id: *ctx.accounts.mango_program_ai.key,
            accounts,
            data,
        };
        msg!("invoke mango");
        invoke( &sol_instruction, account_infos)?;

        Ok(())
    }

    pub fn deposit(ctx: Context<DepositAccounts>, amount : u64, _acc_bump: u8) -> ProgramResult{
        msg!("start deposit");
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
            msg!("changing authority");
            // temporarily transfer authority of account to owner before applying 
            let cpi_acc = SetAuthority {
                account_or_mint: accounts.client_token_account.to_account_info().clone(),
                current_authority: accounts.client.clone(),
            };
            let cpi = CpiContext::new(accounts.token_program.to_account_info(), cpi_acc);
            token::set_authority( cpi,  AuthorityType::AccountOwner, Some(*accounts.owner.key))?;
        }
        msg!("calling mango deposit");
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
        invoke( &deposit_instruction, account_infos) ?;

        {
            msg!("setting back ownership");
            // transfer ownership back to the client
            let cpi_acc = SetAuthority {
                account_or_mint: accounts.client_token_account.to_account_info().clone(),
                current_authority: accounts.owner.clone(),
            };
            let cpi = CpiContext::new(accounts.token_program.to_account_info(), cpi_acc);
            token::set_authority( cpi,  AuthorityType::AccountOwner, Some(*accounts.client.key))?;
        }
        msg!("setting client info");
        let client_acc_info = &mut accounts.client_account_info;
        client_acc_info.client_key = *accounts.client.key;
        client_acc_info.mint = accounts.client_token_account.mint;
        client_acc_info.amount += amount;
        Ok(())
    }

    pub fn withdraw( ctx: Context<WithdrawAccounts>, amount : u64 )  -> ProgramResult {
        msg!("check if can withdraw");
        let accounts = ctx.accounts;
        let client_acc_info = &mut accounts.client_account_info;
        assert!(client_acc_info.client_key == *accounts.client.key);
        assert!(client_acc_info.mint == accounts.client_token_account.mint);
        assert!(accounts.client_token_account.owner == *accounts.client.key);
        assert!(client_acc_info.amount >= amount);

        msg!("start withdraw");
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
            accounts.owner.to_account_info().clone(),
            accounts.token_program.to_account_info().clone(),
        ];
        let open_orders = { 
            let mango_account = mango::state::MangoAccount::load_checked(&accounts.mango_account, accounts.mango_program_ai.key, accounts.mango_group.key)?;
            mango_account.spot_open_orders
        };

        msg!("{}",accounts.mango_program_ai.key.to_string());
        msg!("{}",accounts.mango_group.key.to_string());
        msg!("{}",accounts.mango_account.key.to_string());
        msg!("{}",accounts.owner.key.to_string());
        msg!("{}",accounts.mango_cache_ai.key.to_string());
        msg!("{}",accounts.root_bank_ai.key.to_string());
        msg!("{}",accounts.node_bank_ai.key.to_string());
        msg!("{}",accounts.vault.key.to_string());
        msg!("{}",accounts.client_token_account.key().to_string());
        msg!("{}",accounts.owner.key.to_string());
        msg!("{}",open_orders.len());
        msg!("{}",open_orders[0]);
        msg!("{}",open_orders[14]);

        let withdraw_instruction = mango::instruction::withdraw(accounts.mango_program_ai.key,
            accounts.mango_group.key,
            accounts.mango_account.key,
            accounts.owner.key,
            accounts.mango_cache_ai.key,
            accounts.root_bank_ai.key,
            accounts.node_bank_ai.key,
            accounts.vault.key,
            accounts.client_token_account.to_account_info().key,
            accounts.owner.key,
            &open_orders,
            amount,
            false)?;
        // call mango
        msg!("invoke mango");
        invoke( &withdraw_instruction, account_infos) ?;
        msg!("invoke done");
        client_acc_info.amount -= amount;
        if client_acc_info.amount == 0 {
            // client has no more deposit close its account
            let cpi_accounts = CloseAccount {
                account: accounts.client_account_info.to_account_info().clone(),
                destination: accounts.client.clone(),
                authority: accounts.client.clone(),
            };
            let cpi_program = accounts.token_program.to_account_info().clone();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            token::close_account(cpi_ctx)?;
        }
        Ok(())
    }
}

// check instruction.rs in mango-v3 repo to find out which accounts are required.
#[derive(Accounts)]
#[instruction(acc_bump : u8)]
pub struct InitializeAccounts<'info> {
    mango_program_ai : AccountInfo<'info>,
    mango_group: AccountInfo<'info>,
    #[account( init, 
        seeds = [MANGO_ACCOUNT, &user.key.to_bytes()], 
        bump = acc_bump, 
        payer = user,
        owner = *mango_program_ai.key,
        space = std::mem::size_of::<mango::state::MangoAccount>() )]
    mango_account: AccountInfo<'info>,
    #[account(mut, signer)]
    user: AccountInfo<'info>,
    system_program : AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(_amount: u64, acc_bump: u8)]
pub struct DepositAccounts<'info> {
    mango_program_ai : AccountInfo<'info>,
    mango_group: AccountInfo<'info>,
    #[account(mut)]
    mango_account: AccountInfo<'info>,
    #[account(mut, signer)]
    owner : AccountInfo<'info>,
    mango_cache_ai : AccountInfo<'info>,
    root_bank_ai : AccountInfo<'info>,
    #[account(mut)]
    node_bank_ai : AccountInfo<'info>,
    #[account(mut)]
    vault : AccountInfo<'info>,
    
    #[account(mut)]
    client_token_account : Account<'info, TokenAccount>,
// custom fields
    #[account(mut, signer,
        constraint = client_token_account.owner == *client.key)]
    client : AccountInfo<'info>,

    #[account( init_if_needed,
        seeds = [b"mango-client-info".as_ref(), &client.key.to_bytes(), &owner.key.to_bytes()],
        bump = acc_bump, 
        payer = client, 
        space = 8 + std::mem::size_of::<ClientAccountInfo>() )]
    client_account_info : Account<'info, ClientAccountInfo>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct WithdrawAccounts<'info> {
    mango_program_ai : AccountInfo<'info>,
    #[account(mut)]
    mango_group: AccountInfo<'info>,
    #[account(mut)]
    mango_account: AccountInfo<'info>,
    #[account(mut, signer)]
    owner : AccountInfo<'info>,
    mango_cache_ai : AccountInfo<'info>,
    root_bank_ai : AccountInfo<'info>,
    #[account(mut)]
    node_bank_ai : AccountInfo<'info>,
    #[account(mut)]
    vault : AccountInfo<'info>,
    
    #[account(mut)]
    client_token_account : Account<'info, TokenAccount>,
    client: AccountInfo<'info>,
    #[account(mut)]
    client_account_info : Account<'info, ClientAccountInfo>,
    pub token_program: Program<'info, Token>,
}

#[account()]
pub struct ClientAccountInfo{
    pub client_key : Pubkey,
    pub mint : Pubkey,
    pub amount : u64,
}