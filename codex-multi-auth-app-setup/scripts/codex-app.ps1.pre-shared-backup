#!/usr/bin/env pwsh
# codex-app.ps1 — Restart the NEW ChatGPT desktop app (the one formerly branded
# "Codex") so it re-reads ~/.codex/auth.json after `codex-multi-auth switch <N>`.
#
# Target app: Microsoft Store MSIX package `OpenAI.Codex` -> ChatGPT.exe
#             AppUserModelID: OpenAI.Codex_<pub>!App
#             (resolved dynamically below so app updates don't break this)
#
# NOT affected: "ChatGPT Classic" (OpenAI.ChatGPT-Desktop / ChatGPT Classic.exe)
# is a different, older app and is intentionally never touched here.
#
# Why this exists:
#   * `codex app` (the @openai/codex CLI, even 0.144.1) only detects the non-Store
#     "Codex" installer and prints "Codex Desktop not found". Your app is the
#     Store MSIX package `OpenAI.Codex`, invisible to that detector, so we launch
#     by AppUserModelID instead.
#   * `Get-Process Codex,codex` only stops the `codex.exe` helper — it leaves
#     `ChatGPT.exe` (the real new desktop app) running with the OLD account token
#     cached in memory, so a switch had no visible effect. We stop ChatGPT.exe.
#
# Usage:
#   codex-app             # stop the new app, then relaunch it
#   codex-app 2           # switch to account 2 first, then stop + relaunch
#   codex-app --no-stop   # just launch (don't kill a running instance)

[CmdletBinding()]
param(
    [switch]$NoStop
)

$ErrorActionPreference = 'Stop'

# Resolve the new ChatGPT desktop app's AppUserModelID from the installed
# package family (stable across versioned updates; the version number in the
# install path changes, the family name does not).
function Resolve-ChatGptDesktopAumid {
    $pkg = Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction SilentlyContinue
    if (-not $pkg) {
        throw "New ChatGPT desktop app (MSIX package 'OpenAI.Codex') not found. Install it from the Microsoft Store."
    }
    return "$($pkg.PackageFamilyName)!App"
}

# Optional account switch before restart
$positional = @()
foreach ($a in $args) {
    if ($a -match '^\d+$') { $positional += $a }
}
if ($positional.Count -gt 0) {
    $idx = $positional[0]
    Write-Host "Switching codex-multi-auth to account $idx ..." -ForegroundColor Cyan
    & codex-multi-auth switch $idx
    if ($LASTEXITCODE -ne 0) { throw "codex-multi-auth switch $idx failed (exit $LASTEXITCODE)." }
}

if (-not $NoStop) {
    Write-Host "Stopping the new ChatGPT desktop app (ChatGPT.exe + codex.exe helper) ..." -ForegroundColor Cyan
    # ChatGPT  -> ChatGPT.exe  (the new desktop app; package OpenAI.Codex)
    # codex    -> codex.exe    (CLI helper bundled with that app)
    # We deliberately do NOT stop 'ChatGPT Classic' (the separate old app).
    Get-Process 'ChatGPT','codex' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800   # let the MSIX host fully release auth.json
}

$aumid = Resolve-ChatGptDesktopAumid
Write-Host "Launching new ChatGPT desktop app ('$aumid') ..." -ForegroundColor Cyan
Start-Process "shell:AppsFolder\$aumid"
Write-Host "Done. The app re-read ~/.codex/auth.json on startup." -ForegroundColor Green