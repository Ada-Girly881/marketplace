#![cfg(test)]

extern crate std;

mod mock_nft {
    use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

    #[contracttype]
    enum DataKey {
        Owner(u64),
    }

    #[contract]
    pub struct MockNft;

    #[contractimpl]
    impl MockNft {
        pub fn mint(env: Env, to: Address, token_id: u64) {
            env.storage()
                .persistent()
                .set(&DataKey::Owner(token_id), &to);
        }

        pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
            let owner: Address = env
                .storage()
                .persistent()
                .get(&DataKey::Owner(token_id))
                .expect("token not minted");
            if owner != from {
                panic!("not owner");
            }
            env.storage()
                .persistent()
                .set(&DataKey::Owner(token_id), &to);
        }

        pub fn transfer_from(
            env: Env,
            _spender: Address,
            from: Address,
            to: Address,
            token_id: u64,
        ) {
            let owner: Address = env
                .storage()
                .persistent()
                .get(&DataKey::Owner(token_id))
                .expect("token not minted");
            if owner != from {
                panic!("not owner");
            }
            env.storage()
                .persistent()
                .set(&DataKey::Owner(token_id), &to);
        }

        pub fn owner_of(env: Env, token_id: u64) -> Address {
            env.storage()
                .persistent()
                .get(&DataKey::Owner(token_id))
                .expect("token not minted")
        }
    }
}

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, Env, IntoVal, Symbol,
};

use crate::contract::NftStakingClient;

fn setup() -> (Env, NftStakingClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let nft = Address::generate(&env);
    let reward_token = Address::generate(&env);

    let staking_id = env.register_contract(None, crate::NftStaking);
    let staking = NftStakingClient::new(&env, &staking_id);

    staking.init(&admin, &nft, &reward_token, &1_000_000i128);

    (env, staking, admin, user1, user2)
}

fn setup_with_mock() -> (Env, NftStakingClient<'static>, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let collection = env.register_contract(None, mock_nft::MockNft);
    let reward_token = Address::generate(&env);

    let staking_id = env.register_contract(None, crate::NftStaking);
    let staking = NftStakingClient::new(&env, &staking_id);

    staking.init(&admin, &collection, &reward_token, &1_000_000i128);

    (env, staking, user, collection, admin)
}

fn mint_token(env: &Env, collection: &Address, to: &Address, token_id: u64) {
    env.invoke_contract::<()>(
        collection,
        &soroban_sdk::Symbol::new(env, "mint"),
        soroban_sdk::vec![env, to.clone().into_val(env), token_id.into_val(env),],
    );
}

#[test]
fn test_stake_and_get_position() {
    let (env, staking, user, collection, _admin) = setup_with_mock();

    mint_token(&env, &collection, &user, 0);
    staking.stake(&user, &collection, &0);
    let pos = staking.get_staked_position(&user, &collection, &0);
    assert!(pos.is_some());
    let p = pos.unwrap();
    assert_eq!(p.owner, user);
    assert_eq!(p.token_id, 0);
}

#[test]
fn test_pause_unpause() {
    let (_env, staking, _user, _collection, admin) = setup_with_mock();

    assert!(!staking.is_paused());
    staking.set_paused(&true);
    assert!(staking.is_paused());
    staking.set_paused(&false);
    assert!(!staking.is_paused());
}

#[test]
fn test_total_staked() {
    let (env, staking, user, collection, _admin) = setup_with_mock();

    mint_token(&env, &collection, &user, 0);
    mint_token(&env, &collection, &user, 1);

    assert_eq!(staking.total_staked(), 0);
    staking.stake(&user, &collection, &0);
    assert_eq!(staking.total_staked(), 1);
    staking.stake(&user, &collection, &1);
    assert_eq!(staking.total_staked(), 2);
}

#[test]
fn test_multiple_stakes_per_user() {
    let (env, staking, user, collection1, _admin) = setup_with_mock();

    mint_token(&env, &collection1, &user, 0);
    mint_token(&env, &collection1, &user, 1);
    staking.stake(&user, &collection1, &0);
    staking.stake(&user, &collection1, &1);

    let stakes = staking.get_user_stakes(&user);
    assert_eq!(stakes.len(), 2);
}

#[test]
fn test_calculate_rewards() {
    let (env, staking, user, collection, _admin) = setup_with_mock();

    mint_token(&env, &collection, &user, 0);

    env.ledger().set(LedgerInfo {
        timestamp: 1000,
        protocol_version: 25,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_persistent_entry_ttl: 200_000,
        min_temp_entry_ttl: 200_000,
        max_entry_ttl: 500_000,
    });

    staking.stake(&user, &collection, &0);

    env.ledger().set(LedgerInfo {
        timestamp: 3000,
        protocol_version: 25,
        sequence_number: 2,
        network_id: Default::default(),
        base_reserve: 10,
        min_persistent_entry_ttl: 200_000,
        min_temp_entry_ttl: 200_000,
        max_entry_ttl: 500_000,
    });

    let rewards = staking.calculate_rewards(&user);
    assert!(rewards > 0);
}

#[test]
fn test_get_user_stakes_empty() {
    let (_env, staking, user, _collection, _admin) = setup_with_mock();

    let positions = staking.get_user_stakes(&user);
    assert_eq!(positions.len(), 0);
}

#[test]
fn test_unstake_returns_nft() {
    let (env, staking, user, collection, _admin) = setup_with_mock();

    mint_token(&env, &collection, &user, 0);
    staking.stake(&user, &collection, &0);
    staking.unstake(&user, &collection, &0);

    let pos = staking.get_staked_position(&user, &collection, &0);
    assert!(pos.is_none());
}

#[test]
fn test_stake_fails_when_not_owner() {
    let (env, staking, user, collection, _admin) = setup_with_mock();

    let non_owner = Address::generate(&env);

    // Mint token 0 to user (the legitimate owner)
    mint_token(&env, &collection, &user, 0);

    // Non-owner attempts to stake token 0 — should panic via transfer ownership check
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        staking.stake(&non_owner, &collection, &0);
    }));
    assert!(result.is_err(), "non-owner staking must panic");

    // Verify no staking record was created for non-owner
    let pos = staking.get_staked_position(&non_owner, &collection, &0);
    assert!(pos.is_none());

    // Verify total staked count remains unchanged
    assert_eq!(staking.total_staked(), 0);

    // Verify token ownership unchanged (still owned by user)
    let owner: Address = env.invoke_contract(
        &collection,
        &Symbol::new(&env, "owner_of"),
        soroban_sdk::vec![&env, 0u64.into_val(&env)],
    );
    assert_eq!(owner, user, "token should still belong to original owner");
}
