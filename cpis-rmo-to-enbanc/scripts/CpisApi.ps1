Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CpisCsrfToken {
    param([Parameter(Mandatory)][string]$Html)

    $match = [regex]::Match($Html, '<meta\s+name="csrf-token"\s+content="([^"]+)"')
    if (-not $match.Success) {
        throw 'The page did not expose a CSRF token.'
    }

    return [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
}

function Get-CpisInertiaPage {
    param([Parameter(Mandatory)][string]$Html)

    $match = [regex]::Match($Html, 'data-page="([^"]+)"')
    if (-not $match.Success) {
        throw 'The page did not expose Inertia page data.'
    }

    $pageJson = [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
    return $pageJson | ConvertFrom-Json -Depth 100
}

function Start-CpisAdminSession {
    param([Parameter(Mandatory)][string]$BaseUrl)

    if (-not $env:CPIS_TASK_ADMIN_EMAIL -or -not $env:CPIS_TASK_PASSWORD) {
        throw 'Missing CPIS_TASK_ADMIN_EMAIL or CPIS_TASK_PASSWORD environment variable.'
    }

    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $loginPage = Invoke-WebRequest -Uri "$BaseUrl/admin/login" -WebSession $session
    $csrf = Get-CpisCsrfToken -Html $loginPage.Content

    $response = Invoke-WebRequest -Uri "$BaseUrl/admin/login" -Method Post -WebSession $session -Body @{
        _token = $csrf
        email = $env:CPIS_TASK_ADMIN_EMAIL
        password = $env:CPIS_TASK_PASSWORD
    }

    return $session
}

function Get-CpisEmailLogs {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$AdminSession,
        [Parameter(Mandatory)][string]$WorkflowEmail
    )

    $encodedEmail = [uri]::EscapeDataString($WorkflowEmail)
    $page = Invoke-WebRequest -Uri "$BaseUrl/logs/email?search=$encodedEmail" -WebSession $AdminSession
    $inertia = Get-CpisInertiaPage -Html $page.Content
    return @($inertia.props.logs.data)
}

function Get-CpisLatestOtp {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$AdminSession,
        [Parameter(Mandatory)][string]$WorkflowEmail,
        [long]$AfterId = 0,
        [int]$TimeoutSeconds = 15
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        $logs = Get-CpisEmailLogs -BaseUrl $BaseUrl -AdminSession $AdminSession -WorkflowEmail $WorkflowEmail
        $log = $logs | Where-Object {
        ([string]$_.to).Trim().ToLowerInvariant() -eq $WorkflowEmail.ToLowerInvariant() -and
        ([string]$_.subject) -eq 'CPIS Login Verification OTP' -and
        ([long]$_.id -gt $AfterId)
        } | Sort-Object { [long]$_.id } | Select-Object -First 1

        if ($log) {
            $otpMatch = [regex]::Match([string]$log.body, '\b(\d{6})\b')
            if (-not $otpMatch.Success) {
                throw "The latest OTP email for $WorkflowEmail did not contain a six-digit code."
            }

            return $otpMatch.Groups[1].Value
        }

        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "No new OTP email became visible for $WorkflowEmail within $TimeoutSeconds seconds."
}

function Get-CpisLatestOtpLogId {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$AdminSession,
        [Parameter(Mandatory)][string]$WorkflowEmail
    )

    $logs = Get-CpisEmailLogs -BaseUrl $BaseUrl -AdminSession $AdminSession -WorkflowEmail $WorkflowEmail
    $latest = $logs | Where-Object {
        ([string]$_.to).Trim().ToLowerInvariant() -eq $WorkflowEmail.ToLowerInvariant() -and
        ([string]$_.subject) -eq 'CPIS Login Verification OTP'
    } | Measure-Object -Property id -Maximum

    if ($null -eq $latest.Maximum) {
        return 0
    }

    return [long]$latest.Maximum
}

function Start-CpisWorkflowSession {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$AdminSession,
        [Parameter(Mandatory)][string]$WorkflowEmail
    )

    if (-not $env:CPIS_TASK_PASSWORD) {
        throw 'Missing CPIS_TASK_PASSWORD environment variable.'
    }

    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $loginPage = Invoke-WebRequest -Uri "$BaseUrl/workflow/login" -WebSession $session
    $csrf = Get-CpisCsrfToken -Html $loginPage.Content
    $latestOtpLogId = Get-CpisLatestOtpLogId -BaseUrl $BaseUrl -AdminSession $AdminSession -WorkflowEmail $WorkflowEmail

    $otpPage = Invoke-WebRequest -Uri "$BaseUrl/workflow/login" -Method Post -WebSession $session -Body @{
        _token = $csrf
        email = $WorkflowEmail
        password = $env:CPIS_TASK_PASSWORD
    }

    $otpUri = [uri]$otpPage.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
    $token = [System.Web.HttpUtility]::ParseQueryString($otpUri.Query).Get('token')
    if (-not $token) {
        throw "Workflow login for $WorkflowEmail did not reach the OTP page."
    }

    $otp = Get-CpisLatestOtp -BaseUrl $BaseUrl -AdminSession $AdminSession -WorkflowEmail $WorkflowEmail -AfterId $latestOtpLogId
    $otpPage = Invoke-WebRequest -Uri "$BaseUrl/workflow/otp?token=$([uri]::EscapeDataString($token))" -WebSession $session
    $otpCsrf = Get-CpisCsrfToken -Html $otpPage.Content
    # The server concatenates otpDigits in received order, so preserve 0→5 order.
    $otpForm = [ordered]@{ _token = $otpCsrf; token = $token }
    foreach ($index in 0..5) {
        $otpForm["otpDigits[$index]"] = $otp[$index]
    }

    $completion = Invoke-WebRequest -Uri "$BaseUrl/workflow/otp" -Method Post -WebSession $session -Body $otpForm -SkipHttpErrorCheck
    $location = $completion.Headers['X-Inertia-Location']
    if ($location) {
        $null = Invoke-WebRequest -Uri $location -WebSession $session
    } elseif ($completion.StatusCode -ge 400) {
        throw "OTP verification for $WorkflowEmail failed with HTTP $($completion.StatusCode)."
    }

    return $session
}

function Get-CpisClaimSnapshot {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][string]$Docket
    )

    $page = Invoke-WebRequest -Uri "$BaseUrl/workflow/my-queue/$([uri]::EscapeDataString($Docket))" -WebSession $WorkflowSession
    $inertia = Get-CpisInertiaPage -Html $page.Content
    $claimResource = $inertia.props.claim
    if (-not $claimResource) {
        throw "Claim $Docket was not available to this workflow user."
    }

    $claim = if ($claimResource.PSObject.Properties.Name -contains 'data') {
        $claimResource.data
    } else {
        $claimResource
    }

    if (-not $claim) {
        throw "Claim $Docket did not contain a claim record."
    }

    return $claim
}

function Get-CpisClaimActions {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][int]$ClaimId,
        [string]$ActionContext
    )

    $headers = @{ Accept = 'application/json'; 'X-Requested-With' = 'XMLHttpRequest' }
    $uri = "$BaseUrl/workflow/claims/$ClaimId/actions"
    if ($ActionContext) {
        $uri += "?context=$([uri]::EscapeDataString($ActionContext))"
    }
    $response = Invoke-WebRequest -Uri $uri -WebSession $WorkflowSession -Headers $headers
    $json = $response.Content | ConvertFrom-Json -Depth 100
    if ($json.status -ne 'success') {
        throw "Action metadata request for claim $ClaimId did not succeed."
    }

    return $json.data
}

function Get-CpisClaimHistory {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][int]$ClaimId
    )

    $headers = @{ Accept = 'application/json'; 'X-Requested-With' = 'XMLHttpRequest' }
    $response = Invoke-WebRequest -Uri "$BaseUrl/workflow/claims/$ClaimId/history" -WebSession $WorkflowSession -Headers $headers
    $json = $response.Content | ConvertFrom-Json -Depth 100
    if ($json.status -ne 'success') {
        throw "History request for claim $ClaimId did not succeed."
    }

    return @($json.data)
}

function Get-CpisObjectProperty {
    param(
        [Parameter(Mandatory)][object]$Object,
        [Parameter(Mandatory)][string]$Name,
        [object]$Default = $null
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $Default
    }

    return $property.Value
}

function Get-CpisWorkflowCsrfToken {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][string]$Docket
    )

    $page = Invoke-WebRequest -Uri "$BaseUrl/workflow/my-queue/$([uri]::EscapeDataString($Docket))" -WebSession $WorkflowSession
    return Get-CpisCsrfToken -Html $page.Content
}

function Save-CpisRecordOfficerAttachment {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][int]$ClaimId,
        [Parameter(Mandatory)][string]$Docket,
        [Parameter(Mandatory)][string]$AttachmentPath
    )

    if (-not (Test-Path -LiteralPath $AttachmentPath -PathType Leaf)) {
        throw "Attachment file was not found: $AttachmentPath"
    }

    $csrf = Get-CpisWorkflowCsrfToken -BaseUrl $BaseUrl -WorkflowSession $WorkflowSession -Docket $Docket
    $headers = @{ Accept = 'application/json'; 'X-Requested-With' = 'XMLHttpRequest'; 'X-CSRF-TOKEN' = $csrf }
    $form = [ordered]@{
        _token = $csrf
        'attachments[0]' = Get-Item -LiteralPath $AttachmentPath
    }

    $response = Invoke-WebRequest -Uri "$BaseUrl/workflow/claims/$ClaimId/attachments" -Method Post -WebSession $WorkflowSession -Headers $headers -Form $form -SkipHttpErrorCheck
    $body = if ($response.Content) { $response.Content | ConvertFrom-Json -Depth 100 } else { $null }
    if ($response.StatusCode -ge 400 -or ($body -and (Get-CpisObjectProperty -Object $body -Name 'status') -eq 'failed')) {
        $message = if ($body) { Get-CpisObjectProperty -Object $body -Name 'message' -Default $response.Content } else { $response.Content }
        throw "Attachment upload for $Docket failed (HTTP $($response.StatusCode)): $message"
    }

    return $body
}

function Get-CpisActionType {
    param([Parameter(Mandatory)][object]$Decision)

    $label = (([string](Get-CpisObjectProperty -Object $Decision -Name 'name' -Default '')) + ' ' + ([string](Get-CpisObjectProperty -Object $Decision -Name 'type_name' -Default ''))).ToLowerInvariant()
    if ($label -match 'return') { return 'return' }
    if ($label -match 'dispute') { return 'dispute' }
    if ($label -match 'reject') { return 'reject' }
    return 'forward'
}

function Find-CpisDecision {
    param(
        [Parameter(Mandatory)][object]$ActionData,
        [Parameter(Mandatory)][string]$DecisionLabel
    )

    $match = @($ActionData.available_actions.decisions | Where-Object {
        ([string](Get-CpisObjectProperty -Object $_ -Name 'name' -Default '')).Trim().ToLowerInvariant() -eq $DecisionLabel.Trim().ToLowerInvariant()
    })
    if ($match.Count -ne 1) {
        $labels = @($ActionData.available_actions.decisions | ForEach-Object { [string](Get-CpisObjectProperty -Object $_ -Name 'name' -Default '') }) -join ', '
        throw "Expected exactly one '$DecisionLabel' action, found $($match.Count). Available actions: $labels"
    }

    return $match[0]
}

function Find-CpisTargetEmployee {
    param(
        [Parameter(Mandatory)][object]$Decision,
        [Parameter(Mandatory)][string]$EmployeeName
    )

    $match = @($Decision.target_employees | Where-Object {
        ([string](Get-CpisObjectProperty -Object $_ -Name 'employee_name' -Default '')).Trim().ToLowerInvariant() -eq $EmployeeName.Trim().ToLowerInvariant()
    })
    if ($match.Count -ne 1) {
        $names = @($Decision.target_employees | ForEach-Object { [string](Get-CpisObjectProperty -Object $_ -Name 'employee_name' -Default '') }) -join ', '
        throw "Expected exactly one target employee '$EmployeeName', found $($match.Count). Available targets: $names"
    }

    return $match[0]
}

function Invoke-CpisClaimAction {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][object]$Claim,
        [Parameter(Mandatory)][string]$Docket,
        [Parameter(Mandatory)][object]$ActionData,
        [Parameter(Mandatory)][object]$Decision,
        [Parameter(Mandatory)][object]$TargetEmployee,
        [string]$Remark = 'Workflow routing completed.',
        [string]$ActionContext,
        [string]$AttachmentPath
    )

    $firstStep = @($Decision.decision_list_workflow)[0]
    if ($null -eq $firstStep) {
        throw "Decision '$((Get-CpisObjectProperty -Object $Decision -Name 'name' -Default 'unknown'))' has no workflow step."
    }

    $csrf = Get-CpisWorkflowCsrfToken -BaseUrl $BaseUrl -WorkflowSession $WorkflowSession -Docket $Docket
    $decisionStepId = Get-CpisObjectProperty -Object $firstStep -Name 'decision_step_id' -Default (Get-CpisObjectProperty -Object $firstStep -Name 'id')
    $decisionId = Get-CpisObjectProperty -Object $firstStep -Name 'decision_id' -Default (Get-CpisObjectProperty -Object $firstStep -Name 'id')
    $payload = [ordered]@{
        id = [int](Get-CpisObjectProperty -Object $ActionData.current_block -Name 'id')
        claim_id = [int](Get-CpisObjectProperty -Object $Claim -Name 'id')
        action_context = $ActionContext
        step_id = [int](Get-CpisObjectProperty -Object $Decision -Name 'id')
        remark = $Remark
        remark_for_claimant = ''
        employee_id = [int](Get-CpisObjectProperty -Object $TargetEmployee -Name 'id')
        designation_id = [int](Get-CpisObjectProperty -Object $TargetEmployee -Name 'designation_id')
        target_employee_id = [int](Get-CpisObjectProperty -Object $TargetEmployee -Name 'id')
        action_type = Get-CpisActionType -Decision $Decision
        decision_id = [int]$decisionId
        decision_info_id = [int](Get-CpisObjectProperty -Object $Decision -Name 'id')
        decision_step_id = [int]$decisionStepId
        decision_reason_id = $null
        decision_reason = $null
        document_request_id = $null
        requested_docs = @()
        next_designation_id = [int](Get-CpisObjectProperty -Object $TargetEmployee -Name 'designation_id')
        next_office_layer_id = Get-CpisObjectProperty -Object $TargetEmployee -Name 'office_layer_id'
        next_office_id = Get-CpisObjectProperty -Object $TargetEmployee -Name 'office_id'
        next_municipality_id = Get-CpisObjectProperty -Object $TargetEmployee -Name 'municipality_id'
        next_barangay_id = Get-CpisObjectProperty -Object $TargetEmployee -Name 'barangay_id'
        leave_data = $null
        prepare_dv = $null
        is_next_partial_pay = $false
    }

    $headers = @{ Accept = 'application/json'; 'X-Requested-With' = 'XMLHttpRequest'; 'X-CSRF-TOKEN' = $csrf }
    if ($AttachmentPath) {
        if (-not (Test-Path -LiteralPath $AttachmentPath -PathType Leaf)) {
            throw "Attachment file was not found: $AttachmentPath"
        }
        $form = [ordered]@{ _token = $csrf }
        foreach ($key in $payload.Keys) {
            if ($null -ne $payload[$key]) { $form[$key] = $payload[$key] }
        }
        $form.file = Get-Item -LiteralPath $AttachmentPath
        $response = Invoke-WebRequest -Uri "$BaseUrl/workflow/claims/action" -Method Post -WebSession $WorkflowSession -Headers $headers -Form $form -SkipHttpErrorCheck
    } else {
        $json = $payload | ConvertTo-Json -Depth 30 -Compress
        $response = Invoke-WebRequest -Uri "$BaseUrl/workflow/claims/action" -Method Post -WebSession $WorkflowSession -Headers $headers -ContentType 'application/json' -Body $json -SkipHttpErrorCheck
    }

    $body = if ($response.Content) { $response.Content | ConvertFrom-Json -Depth 100 } else { $null }
    if ($response.StatusCode -ge 400 -or -not $body -or (Get-CpisObjectProperty -Object $body -Name 'status' -Default 'failed') -ne 'success') {
        $message = if ($body) { Get-CpisObjectProperty -Object $body -Name 'message' -Default $response.Content } else { $response.Content }
        throw "Action for $Docket failed (HTTP $($response.StatusCode)): $message"
    }

    return $body
}

function Save-CpisSerDraft {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][object]$Claim,
        [Parameter(Mandatory)][string]$Docket,
        [string]$DatePrepared = (Get-Date -Format 'yyyy-MM-dd')
    )

    $csrf = Get-CpisWorkflowCsrfToken -BaseUrl $BaseUrl -WorkflowSession $WorkflowSession -Docket $Docket
    $payload = [ordered]@{
        date_prepared = $DatePrepared
        legal_unit_head_employee_id = $null
        factual_background = 'Test workflow SER prepared after the required desk reviews and data-validation routing.'
        legal_basis = 'Prepared for CPIS workflow validation in accordance with the applicable claim-processing procedure.'
        findings = 'The workflow record and approved test attachment are available; no active dispute was detected at Legal Assistant.'
        recommendation = 'Endorse the SER for Board Secretary review and Board En Banc consideration.'
        creation_method = 'template'
        checklist = @(
            [ordered]@{ id = 1; label = 'Claim reference(s) attached'; done = $true },
            [ordered]@{ id = 2; label = 'Document review complete'; done = $true },
            [ordered]@{ id = 3; label = 'Validation checklist passed'; done = $true },
            [ordered]@{ id = 4; label = 'Cross-check report attached'; done = $true },
            [ordered]@{ id = 5; label = 'Legal basis cited'; done = $true },
            [ordered]@{ id = 6; label = 'No active disputes (DRU clear)'; done = $true }
        )
    }
    $headers = @{ Accept = 'application/json'; 'X-Requested-With' = 'XMLHttpRequest'; 'X-CSRF-TOKEN' = $csrf }
    $json = $payload | ConvertTo-Json -Depth 30 -Compress
    $claimId = [int](Get-CpisObjectProperty -Object $Claim -Name 'id')
    $response = Invoke-WebRequest -Uri "$BaseUrl/workflow/ser-draft/$claimId/save" -Method Post -WebSession $WorkflowSession -Headers $headers -ContentType 'application/json' -Body $json -SkipHttpErrorCheck
    $body = if ($response.Content) { $response.Content | ConvertFrom-Json -Depth 100 } else { $null }
    if ($response.StatusCode -ge 400 -or -not $body) {
        $message = if ($body) { Get-CpisObjectProperty -Object $body -Name 'message' -Default $response.Content } else { $response.Content }
        throw "SER draft save for $Docket failed (HTTP $($response.StatusCode)): $message"
    }

    return $body
}

function Get-CpisSerDraftState {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][Microsoft.PowerShell.Commands.WebRequestSession]$WorkflowSession,
        [Parameter(Mandatory)][int]$ClaimId
    )

    $page = Invoke-WebRequest -Uri "$BaseUrl/workflow/ser-draft/$ClaimId" -WebSession $WorkflowSession -SkipHttpErrorCheck
    if ($page.StatusCode -ge 400) {
        throw "SER draft page for claim $ClaimId returned HTTP $($page.StatusCode)."
    }

    $inertia = Get-CpisInertiaPage -Html $page.Content
    return [pscustomobject]@{
        SerDraft = Get-CpisObjectProperty -Object $inertia.props -Name 'serDraft'
        ForwardButtonLabel = Get-CpisObjectProperty -Object $inertia.props -Name 'forwardButtonLabel'
    }
}

