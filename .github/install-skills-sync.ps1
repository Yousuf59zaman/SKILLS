[CmdletBinding()]
param(
 [string]$CodexSkillsDir='', [string]$ClaudeSkillsDir='', [string]$GeminiSkillsDir='',
 [switch]$SkipGitHooks, [switch]$SkipStartup, [switch]$SkipInitialSync, [switch]$Quiet
)
# Retired: never recreate automatic hooks, login launchers, or an initial sync.
if(-not $Quiet){Write-Output 'Automatic skills-sync installation is retired. No hooks, startup files or skill copies were installed. Use reviewed manual agent-sync.'}
exit 0
