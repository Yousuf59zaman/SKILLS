[CmdletBinding()]
param(
 [string]$SourceDir='', [switch]$NoPull,
 [string]$RepoUrl='https://github.com/Yousuf59zaman/SKILLS',
 [string[]]$Targets=@(), [switch]$Mirror, [switch]$IncludeNonSkillDirs,
 [switch]$SkipSkillPackages, [switch]$Quiet
)
# Retired compatibility entrypoint. Intentionally no child processes or writes.
if(-not $Quiet){
 Write-Output 'Legacy automatic skills sync is retired. No files were copied and no Git pull was performed.'
 Write-Output 'Run agent-sync/scripts/sync-agent-skills.mjs manually for a dry-run, review GitHub differences, then explicitly approve apply.'
}
exit 0
