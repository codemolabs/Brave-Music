//! Platform-neutral Brave Music domain code.
//!
//! This crate intentionally does not discover the user's home directory, start
//! processes, or migrate files at startup. Platform adapters supply explicit
//! paths and decide when persistence is requested.

pub mod library;
