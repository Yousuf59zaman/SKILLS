# Native transition settlement

## Safety and recovery contract

- `Native-PortSettlement.ps1` is a read-only adapter around the unchanged canonical preflight. Release proves the live gateway separately while projecting the retired native owner into the existing settlement algorithm. Its production CLI has fixed bridge/ports and must be a direct child of the exact service process.
- Each observation pins the four-field service record, settings bytes, process start ticks/CIM birth, executable and arguments, gateway listener, and fence/pause state. PID reuse, live/foreign owners, unreadable queries, unknown states and drift refuse. A positive dead owner and explicit absent-native case are not interchangeable.
- Release has a **90-second monotonic budget** and requires a **12-second sampled free span**, including an initially free port. A held sample resets the quiet clock. The final observation repeats old-owner death, listener inventory and local guards. A finite quiet span is evidence of settlement, **not a reservation or a guarantee against a later listener**. A 16-second synthetic gap deliberately demonstrates that limitation.
- The JS runner admits one exact helper child, validates its bounded protocol and actual exit, and refuses an unsettled helper. Release helper timeout is 100 seconds; Ready timeout is 15 seconds. No helper success is accepted solely because JSON arrived before process exit.
- After the helper returns, the service synchronously rechecks the original record bytes, settings digest, fence absence and exact pause receipt immediately before spawn/generation mutation. A separate Ready observation proves the actual new native PID owns 19457 and the gateway still owns 19458; HTTP readiness alone is insufficient.
- A failed Ready observation parks recovery while preserving a potentially serving live child. It does not kill that child merely because observation failed. A refused release retains the old record and does not manufacture another crash strike.
- Recovery reserves one attempt with a 60-second cooldown and commits the crash-budget reset only after successful gate completion. Cold readiness waits are 90 seconds; accepted recovery can wait 180 seconds, once from the original start, without a sliding deadline. Existing account → healer → startup mutex order and switch fences remain unchanged. The observer itself takes no outer mutex that would deadlock a caller already holding it.

Do not describe every dead-owner LISTENING row as a proven kernel defect. Do not claim a reboot is its only cure. In real disposable experiments some rows released after tens of seconds; a bounded timeout still refuses safely and calls for fresh diagnosis.

Check the installed helper versions, current activation state and private local evidence before using this procedure.
