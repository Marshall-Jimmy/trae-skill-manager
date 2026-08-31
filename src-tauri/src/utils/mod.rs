pub mod path;

/// Return the correct npx executable name for the current platform.
/// On Windows, bare `npx` resolves to a `.ps1` script that Rust's process
/// spawn cannot execute ("program not found"), so use `npx.cmd` explicitly.
pub fn npx_program() -> &'static str {
    #[cfg(windows)]
    {
        "npx.cmd"
    }
    #[cfg(not(windows))]
    {
        "npx"
    }
}
