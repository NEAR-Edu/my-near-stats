use std::{collections::HashSet, ops::Sub, sync::Arc};

use chrono::Duration;
use dotenv::dotenv;

use futures::future::join_all;
use near_jsonrpc_client::JsonRpcClient;
use near_primitives::types::AccountId;
use serde::Deserialize;
use sqlx::{migrate, postgres::PgPoolOptions};
use tokio::{
    join,
    sync::{broadcast, Semaphore},
};

use crate::{
    badge::{transfer, BadgeRegistry},
    connections::Connections,
    indexer::get_recent_actors,
    local::{add_badge_for_account, get_badges_for_account, query_account},
};

pub const MAX_SIMULTANEOUS_ACCOUNTS: usize = 16;
pub const MAX_SIMULTANEOUS_WORKERS_PER_BADGE: usize = 5;

#[derive(Deserialize)]
struct Configuration {
    #[allow(unused)] // env var read by default by sqlx
    pub database_url: String,
    pub indexer_url: String,
    pub rpc_url: String,
}

mod badge;
mod connections;
mod indexer;
mod local;
mod rpc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok();
    migrate!();

    let config = envy::from_env::<Configuration>().expect("Missing environment variables");

    let local_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;

    let indexer_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.indexer_url)
        .await?;

    let rpc_client = JsonRpcClient::connect(&config.rpc_url);

    let connections = Arc::new(Connections {
        local_pool,
        indexer_pool,
        rpc_client,
    });

    println!("Requesting accounts");

    let accounts = get_recent_actors(
        &connections.indexer_pool,
        chrono::Utc::now()
            .sub(Duration::minutes(10))
            .timestamp_nanos()
            .try_into()
            .unwrap(),
    )
    .await
    .unwrap();

    println!("Checking {} accounts", accounts.len());

    println!("Creating badge registry");

    let local_semaphore = Arc::new(Semaphore::new(5));
    let (account_send, account_recv) = broadcast::channel(16);
    local::start_local_updater(local_semaphore, connections.clone(), account_recv);

    let mut badge_registry = BadgeRegistry::new(connections.clone());
    badge_registry.register(&*transfer::BADGE_IDS, transfer::run);
    let badge_registry = Arc::new(badge_registry);

    let simultaneous_accounts = Arc::new(Semaphore::new(MAX_SIMULTANEOUS_ACCOUNTS));

    let mut join_handles = Vec::new();

    for account in accounts {
        let account_id: AccountId = account.parse().unwrap();
        let simultaneous_accounts = Arc::clone(&simultaneous_accounts);
        let permit = simultaneous_accounts.acquire_owned().await;
        let account_send = account_send.clone();
        let connections = Arc::clone(&connections);
        let badge_registry = Arc::clone(&badge_registry);

        let join_handle = tokio::spawn(async move {
            let (account_record, existing_badges) = join!(
                query_account(&connections.local_pool, &account_id),
                get_badges_for_account(&connections.local_pool, &account_id),
            );

            let is_update_allowed = account_record
                .ok()
                .and_then(|r| r.next_update_allowed_at())
                .map(|cutoff| chrono::Utc::now() >= cutoff)
                .unwrap_or(true);

            if !is_update_allowed {
                println!("Disallowing update for {account_id}");
                return;
            }

            if let Err(e) = account_send.send(account_id.clone()) {
                println!("Error sending to local updater: {e:?}");
            }

            let awarded_badges = badge_registry
                .queue_account(
                    account_id.clone(),
                    existing_badges.unwrap_or_else(|_| HashSet::new()),
                )
                .await;

            for badge_id in awarded_badges {
                match add_badge_for_account(&connections.local_pool, &account_id, &badge_id).await {
                    Ok(_) => println!("Added badge {badge_id} to {account_id}"),
                    Err(e) => println!("Failed to add badge {badge_id} to {account_id}: {e:?}"),
                }
            }

            drop(permit);
        });

        join_handles.push(join_handle);
    }

    join_all(join_handles).await;

    Ok(())
}
