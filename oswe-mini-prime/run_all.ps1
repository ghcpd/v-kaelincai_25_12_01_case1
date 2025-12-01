# run_all.ps1 - cross-platform test runner for PowerShell
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Running issue_project tests..."
Push-Location "$Root\..\issue_project"
node --test tests/compatActionLabel.test.js 2>&1 | Tee-Object -FilePath "$Root\results\results_pre_test_output_ps.txt"
Pop-Location

Write-Host "Running Project_B_PostChange tests..."
Push-Location "$Root\Project_B_PostChange"
node --test tests/test_post_change.js 2>&1 | Tee-Object -FilePath "$Root\results\results_post_test_output_ps.txt"
Pop-Location

Write-Host "Finished. Results saved to $Root\results\"
