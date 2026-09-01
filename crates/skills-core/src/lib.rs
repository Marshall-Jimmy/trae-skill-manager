//! skills-core: TRAE Skill Manager 的纯逻辑层。
//!
//! 不依赖 Tauri，可被 GUI（src-tauri）、CLI（skills-cli）、MCP Server 复用。
//! 缓存与配置路径与 GUI 共用同一份（`dirs::data_dir()/trae-skill-manager/`）。

pub mod browse;
pub mod bootstrap;
pub mod cache;
pub mod config;
pub mod diagnose;
pub mod event;
pub mod export;
pub mod favorites;
pub mod fetch;
pub mod history;
pub mod install;
pub mod mcp_sync;
pub mod models;
pub mod preset;
pub mod process;
pub mod recommend;
pub mod remove;
pub mod scan;
pub mod search_github;
pub mod stats;
pub mod toggle;
pub mod tools;
pub mod translate;
pub mod update;
pub mod utils;
