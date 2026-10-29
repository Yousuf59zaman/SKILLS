---
name: windows-4g-failover
description: Diagnose, repair, document, and safely verify a Windows 11 PC-only broadband-to-ZTE-MF833V 4G backup system using a custom PowerShell watchdog, Task Scheduler, and strict standby firewall rules (not Speedify). Use for modem reconnects, Internet outages, failover/failback, interface metrics, recovery loops, Windows network logs, mobile data checks, or updates to this setup's Google Drive document and local skill.
---

# Windows broadband + 4G failover

## System and source of truth

- PC: **Usuf-Desktop**; connect through the user's authorized Remote Desktop Commander device, not by assuming the PC is online.
- Primary: `Ethernet 2` (Realtek wired broadband), expected healthy IPv4 metric **15**.
- Backup: `Ethernet 3` (ZTE MF833V RNDIS, Banglalink SIM), expected healthy IPv4 metric **400** in standby.
- Both have historically advertised `192.168.0.1` as gateway on separate `192.168.0.0/24` networks. Avoid guessing the destination from an unbound request.
- **Speedify is installed but is not the active failover engine.** Active system is custom Windows PowerShell + Task Scheduler + two scoped firewall rules.
- Authoritative current state is the **live PC**, not an older chat or a previous successful test. Check these before diagnosing:
  - `C:\ProgramData\ChatGPT-NetworkFailover\Monitor.ps1` (protected production watchdog)
  - `C:\ProgramData\ChatGPT-NetworkFailover\status.json`
  - `C:\ProgramData\ChatGPT-NetworkFailover\events.log`
  - named firewall rules `ChatGPT-Strict4G-Out` and `ChatGPT-Strict4G-In`
  - scheduled tasks `ChatGPT-Broadband-4G-Watchdog` and `ChatGPT-StrictStandby-Recovery` (may require elevated local PowerShell to enumerate)
- Google Drive project document: [24/7 PC Internet Backup Setup](https://docs.google.com/document/d/1zPbeDxLofvfVDLoK5x6GYevY0rlDht_tgUtVYRk2jGU/edit). Read the latest dated checkpoint, not the old Speedify planning section.
- For observed 29 October 2026 behavior and v3.1 deployment, read [verified-state.md](references/verified-state.md).

## Hard safety constraints

1. **Read-only first.** Record live timestamp, PC online state, adapter identities, IPs/routes/metrics, status file age, log tail, firewall rule scope, and actual network traffic evidence. Use [Inspect-Failover.ps1](scripts/Inspect-Failover.ps1) for a read-only snapshot if PowerShell is available.
2. Never turn off or restart `Ethernet 2`, unplug the broadband/WAN, change its IP/gateway, or create an inbound/outbound block on the primary while relying exclusively on Remote Desktop Commander. A local person and separate recovery channel are required for any disruptive WAN-loss test.
3. Never use `Restart-NetAdapter` on `Ethernet 3` reflexively: on 29 October it hung, leaving RNDIS physically `Up` but without any IPv4 interface/route. A physical **USB-only** unplug/replug recovered it; do not remotely disable USB hubs, reboot the PC, or reset the entire network stack as a first step.
4. Adapter `Up`, Windows `Internet` classification, successful modem ping, and current SIM balance are **different kinds of evidence**. Do not claim 4G works until interface-bound HTTPS succeeds through the modem when its firewall gate is intentionally and safely opened. Strict standby intentionally blocks 4G traffic while broadband is healthy.
5. Check the stable adapter `InterfaceGuid` before editing settings. Never repurpose firewall rules or ports owned by Tailscale, RDP, other VPNs, or other apps.
6. Production edits need current-file hash verification, a protected backup, read-only tests first, local Administrator/UAC approval, a time-bounded rollback plan, and post-change verification. Do not publish changes to GitHub or sync every unrelated skill merely to update this skill.
7. Never call a test or repair "complete" based only on parser checks/dry-runs or the absence of fresh log errors. Distinguish **configured**, **normal-mode verified**, **independent 4G verified**, and **actual failover/failback proven**.

## Diagnostic workflow

1. Read `status.json` and `events.log` tail. Compare `LastCheck` with the real PC clock, not just a `Preferred=Broadband` value. If stale, inspect recovery task and errors before making changes.
2. Inspect `Ethernet 2` and `Ethernet 3`: `Get-NetAdapter`, `Get-NetIPInterface -AddressFamily IPv4`, `Get-NetIPAddress`, `Get-NetRoute -DestinationPrefix '0.0.0.0/0'`, `Get-NetConnectionProfile`. Bind source-specific probes when needed. Confirm broadband via a source-bound HTTPS `204` result and `local_ip`.
3. Inspect only the two `ChatGPT-Strict4G-*` firewall rules (Enabled, Action, Direction, and `Get-NetFirewallInterfaceFilter`). Correctly blocked 4G traffic is not evidence of a broken SIM.
4. Inspect `ChatGPT-Broadband-4G-Watchdog` and `ChatGPT-StrictStandby-Recovery` tasks **with appropriate permissions**. Access-denied or empty non-elevated output does not prove tasks are missing. Check the process + fresh status heartbeat too.
5. Classify failure: broadband/ISP health; ZTE USB driver or DHCP; missing SIM/mobile data; overlapping gateway; firewall scope; failover trigger; failback; watchdog crash/recovery loop; stale status.
6. If the modem loses IPv4 after a USB/driver fault, have the user physically reinsert **only the ZTE modem** and recheck DHCP/IP/gateway. Protect broadband.
7. For a real failover test, first prove independent 4G internet using a supervised **bounded** 4G gate opening and guaranteed restore; then test loss of broadband/WAN with the user at the PC. Observe actual 4G HTTPS, route switch, return to primary, and restored strict standby. Do not simulate WAN loss over the only remote link.
8. After any code change, verify the live installed hash, a fresh watchdog heartbeat, no new errors, interface metrics, 4G firewall scope, broadband reachability, task persistence, and rollback state; update the Google Drive doc with timestamp and clear pass/pending labels.

## Version 3.1 behavior (29 October 2026)

- Production Monitor SHA-256 after successful deployment: `E22407B25D87453BF3E1130AD5422FB5173305A5A57088570C1004768B48ABA3` (reference only; **recompute before trusting**).
- `status.json` retains `Version=2` for compatibility and has `Build=v3.1`.
- **Failback fix:** After repeated direct primary health checks, prefer broadband and verify that ordinary default egress is broadband. Do not block failback solely because the modem's public IP is unavailable. Restore strict 4G standby only after verified default broadband egress and valid gate scope; if validation fails, log degraded state and leave the mobile gate open for availability.
- **USB/firewall-scope fix:** A numeric/unresolved alias can appear on reconnect. Check the intended adapter's GUID; rebind only the two owned firewall filters, verify scope, and retry/log instead of crashing the entire monitor for a transient scope mismatch. This still needs a real USB reconnect regression test under v3.1.
- Prior production copy: `C:\ProgramData\ChatGPT-NetworkFailover\Monitor.BeforeV3-20261029-223042.ps1`; staging and deploy logs under `%LOCALAPPDATA%\ChatGPT\NetworkFailover\`. Do not run rollback casually; check existing tasks/marker and use a locally supervised recovery.
- Last observed v3.1 deployment test: normal broadband and strict-standby **pass**; 4G independently available, actual WAN-loss failover/failback, reboot persistence, and billable standby data **remain unverified**.

## Updating documentation or Skill

- Preserve earlier checkpoint history in the Drive document; add a dated status checkpoint and update the top summary so older contradictory instructions are clearly historical.
- Add only supported observed facts, commands, timestamps, exact file paths, regression results, rollback evidence, and unresolved items. Do not imply SIM balance or live mobile data capability was checked if it was not.
- Update this Skill plus its reference and diagnostic script when changing the operational procedure. Validate and package the entire Skill, then sync **only this skill** into desired agent roots after checking for conflicts. A dirty or behind Git repository is not consent to pull/push.

## Validation quick reference

```powershell
& "$env:USERPROFILE\.codex\skills\windows-4g-failover\scripts\Inspect-Failover.ps1" -ProbeBroadband
```

The script is **read-only**. Never use its snapshot alone as proof of automatic mobile failover.
