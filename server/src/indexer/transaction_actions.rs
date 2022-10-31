//! SeaORM Entity. Generated by sea-orm-codegen 0.9.1

use super::sea_orm_active_enums::ActionKind;
use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "transaction_actions")]
pub struct Model {
    #[sea_orm(primary_key, column_type = "Text")]
    pub transaction_hash: String,
    #[sea_orm(primary_key)]
    pub index_in_transaction: i32,
    pub action_kind: ActionKind,
    pub args: Json,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        panic!("No RelationDef")
    }
}

impl ActiveModelBehavior for ActiveModel {}