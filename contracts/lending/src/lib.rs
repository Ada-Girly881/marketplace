#![no_std]

pub mod types;
pub mod storage;
pub mod oracle;
pub mod contract;

pub use contract::*;

#[cfg(test)]
mod test;
