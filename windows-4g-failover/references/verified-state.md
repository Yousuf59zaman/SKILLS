# Setup and incident evidence — 29 October 2026

## Confirmed configuration

| Element | Verified value | Caveat |
| --- | --- | --- |
| PC | Usuf-Desktop, Windows 11 | Remote Desktop Commander must independently confirm online |
| Primary | Ethernet 2, Realtek, `192.168.0.100`, metric 15 | DHCP and addresses can change |
| Backup | Ethernet 3, ZTE MF833V RNDIS, `192.168.0.190`, metric 400 | Banglalink SIM; mobile internet not proven in latest post-deploy session |
| Gate | `ChatGPT-Strict4G-Out`, `ChatGPT-Strict4G-In` | Block inbound/outbound scoped to Ethernet 3 when in strict standby |
| Monitor | `C:\ProgramData\ChatGPT-NetworkFailover\Monitor.ps1` | Protected; executes as SYSTEM through scheduled task |
| Recovery | `ChatGPT-StrictStandby-Recovery` | Restarts stale monitor; do not infer absent from access-denied query |
| Status/events | `C:\ProgramData\ChatGPT-NetworkFailover\status.json`, `events.log` | Status can be stale; compare `LastCheck` to PC clock |
| Historical gateways | Both use `192.168.0.1` on distinct `192.168.0.0/24` interfaces | Causes routing/dashboard ambiguity; do not change without rollback plan |

## 29 October incident and upgrade timeline (Bangladesh time)

- User experienced two Internet interruptions, approximately 1 hour 15 minutes in the morning and around 15 minutes later; precise user-impact intervals are not independently proven.
- 08:51:26 watchdog log: `ROUTE SWITCH Mobile`; proves a route switch was recorded, not a sustained working application-level 4G connection.
- 10:48 Windows logged Remote NDIS device reset and modem connectivity degradation; a driver/USB fault is evidenced.
- 12:33:13–12:51:47 Windows NCSI detected broadband Internet loss/return (~18 min 34 s), resembling shorter outage. NCSI is diagnostic, not a complete ISP postmortem.
- Repeated old-watchdog `Failback held: independent egress not proven` meant broadband could recover while mode remained Mobile.
- The strict gate intermittently produced `Unexpected gate scope: ChatGPT-Strict4G-Out` errors, leading to recovery restarts. A temporary numeric Windows firewall LUID was observed instead of `Ethernet 3`.
- A previous admin `Restart-NetAdapter` call for `Ethernet 3` hung; USB device stayed Up while IPv4 address and default route vanished. User physically unplugged/replugged modem; IPv4 `192.168.0.190` and default route returned.
- 22:30:42 v3.1 deployment preflight passed; 22:30:44 v3 watchdog launched; 22:30:51 and 22:31:12 fresh heartbeats; 22:31:14 installer reported SUCCESS, disarmed 6-minute rollback job, and preserved backup.
- 22:33–22:36 fresh `status.json` had `Build=v3.1`, `Preferred=Broadband`, `BroadbandHealthy=true`, `StrictStandby=true`, `MobileTrafficBlocked=true`, `FailureCount=0`; two owned firewall rules enabled and scoped to Ethernet 3; no new monitor error in the observed window.
- v3.1 monitor SHA-256 on deployment: `E22407B25D87453BF3E1130AD5422FB5173305A5A57088570C1004768B48ABA3`.

## Important distinction

- **Software deployment successful:** syntax checks, dry-run in healthy broadband mode, simulated Mobile-branch dry-run, live healthy-state heartbeats and default broadband verified.
- **Still pending:** independent Banglalink 4G HTTPS/public egress and data balance; **real** automatic failover/failback and WAN-stays-linked tests; reboot and USB-reconnect regression under v3.1; multi-day stability and SIM billed usage.
- The ordinary 4G-bound HTTPS test will fail when strict standby firewall gate is on, by design. Never claim SIM outage from that result alone.

## Safe next steps

1. Read live status/logs and the top of the Google Drive checkpoint.
2. Confirm both adapters, IP addresses, Windows firewall scope, main scheduled task, recovery task and latest Monitor hash; do not assume the historical interface index is still correct.
3. Before testing mobile internet, establish a **local** supervised rollback and gate-restore mechanism; test independently without unplugging broadband.
4. With the user present at the PC, run a bounded WAN-loss simulation or actual outage test, and then verify failback to primary and strict standby. A test that blocks the only remote route is forbidden without out-of-band access.
5. Do not call setup fully reliable until those tests pass and are logged to the Drive document.

## Reference paths

- [Google Drive project document](https://docs.google.com/document/d/1zPbeDxLofvfVDLoK5x6GYevY0rlDht_tgUtVYRk2jGU/edit)
- Staged v3.1 source: `%LOCALAPPDATA%\ChatGPT\NetworkFailover\Monitor.V3.ps1`
- Deployment script: `%LOCALAPPDATA%\ChatGPT\NetworkFailover\Deploy.V3.ps1`
- Deployment result: `%LOCALAPPDATA%\ChatGPT\NetworkFailover\deploy-v3-result.txt`
- Production copy: `C:\ProgramData\ChatGPT-NetworkFailover\Monitor.ps1`
- Historical backup: `C:\ProgramData\ChatGPT-NetworkFailover\Monitor.BeforeV3-20261029-223042.ps1`
- Rollback helper: `C:\ProgramData\ChatGPT-NetworkFailover\Rollback.V3.ps1`
