//! SeaORM Entity. Generated by sea-orm-codegen 0.9.1

use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "execution_outcome_receipts")]
pub struct Model {
    #[sea_orm(primary_key, column_type = "Text")]
    pub executed_receipt_id: String,
    #[sea_orm(primary_key)]
    pub index_in_execution_outcome: i32,
    #[sea_orm(column_type = "Text")]
    pub produced_receipt_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        panic!("No RelationDef")
    }
}

impl ActiveModelBehavior for ActiveModel {}
